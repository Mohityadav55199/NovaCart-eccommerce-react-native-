import { Order } from "../models/order.model.js";
import { Product } from "../models/product.model.js";
import { stripe } from "../config/stripe.js";
import { REFUND_APPROVAL_OVER, SUPPORT_REFUND_LIMIT } from "../config/limits.js";
import { User } from "../models/user.model.js";
import { adminEmailList } from "../middleware/auth.middleware.js";
import { payoutDeliveredItems } from "./payout.service.js";

// an error the controllers can turn straight into an HTTP response
export class OrderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const respondWithError = (res, error, label) => {
  if (error instanceof OrderError) return res.status(error.status).json({ error: error.message });

  console.error(`Error in ${label}:`, error);
  return res.status(500).json({ error: "Internal server error" });
};

const CONFLICT = "This order changed while you were working on it. Refresh and try again.";

/**
 * Cancels an order that has not shipped yet: refunds the full payment on Stripe, puts the stock back
 * and records who cancelled it and why.
 *
 * Safe to call twice at once: the first call atomically claims the order (pending -> cancelled, items
 * included), so the refund and the restock can only happen once, and no vendor update can slip in.
 */
export async function cancelOrder(orderId, { reason = "", by }) {
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, status: "pending" },
    { $set: { status: "cancelled", "orderItems.$[].status": "cancelled" } },
    { new: false }
  );

  if (!claimed) {
    const existing = await Order.findById(orderId).select("status");
    if (!existing) throw new OrderError(404, "Order not found");
    if (existing.status === "cancelled") throw new OrderError(400, "This order is already cancelled");
    throw new OrderError(400, "This order has already shipped and can no longer be cancelled");
  }

  let refund = null;
  try {
    if (claimed.paymentResult?.id && claimed.paymentResult.status === "succeeded") {
      // idempotency key: a retry returns the same refund instead of refunding twice
      refund = await stripe.refunds.create(
        {
          payment_intent: claimed.paymentResult.id,
          reason: "requested_by_customer",
          metadata: { orderId: claimed._id.toString(), cancelledBy: by },
        },
        { idempotencyKey: `refund-${claimed._id}` }
      );
    }
  } catch (error) {
    // nothing was refunded, so give the order back as it was (a pending order has only pending items)
    await Order.updateOne(
      { _id: claimed._id },
      { $set: { status: "pending", "orderItems.$[].status": "pending" } }
    );
    console.error("Stripe refund failed:", error.message);
    throw new OrderError(502, "The refund could not be processed. The order was not cancelled, please try again.");
  }

  const order = await Order.findById(claimed._id);
  if (refund) order.paymentResult.status = "refunded";
  order.cancellation = {
    reason,
    by,
    at: new Date(),
    refundId: refund?.id,
    refundAmount: refund ? refund.amount / 100 : 0,
  };
  if (order.refundRequest?.status === "pending") {
    order.refundRequest.status = "rejected";
    order.refundRequest.decidedBy = "system (order was cancelled)";
    order.refundRequest.decidedAt = new Date();
  }
  order.recomputeStatus();
  order.statusHistory.push({
    status: "cancelled",
    note: reason ? `Cancelled: ${reason}` : "Order cancelled",
    by,
  });
  await order.save();

  await Promise.all(
    order.orderItems.map((item) =>
      Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } })
    )
  );

  return order;
}

// Writes the status derived from the items, but never over a cancellation that happened meanwhile
async function applyDerivedStatus(orderId, events) {
  const order = await Order.findById(orderId);
  if (!order) throw new OrderError(404, "Order not found");

  const before = order.status;
  order.recomputeStatus();
  const changed = order.status !== before;

  const result = await Order.updateOne(
    { _id: orderId, status: { $ne: "cancelled" } },
    {
      $set: {
        status: order.status,
        shippedAt: order.shippedAt ?? null,
        deliveredAt: order.deliveredAt ?? null,
      },
      $push: {
        statusHistory: {
          $each: changed ? [...events, { status: order.status, note: `Order is now ${order.status}`, by: "system" }] : events,
        },
      },
    }
  );
  if (result.matchedCount === 0) throw new OrderError(409, CONFLICT);

  return Order.findById(orderId);
}

// a vendor moves an item one step at a time: shipped first, then delivered (admins may set any status)
const NEXT_STATUS = { pending: ["shipped"], shipped: ["delivered"], delivered: [] };

/**
 * Updates one order item's fulfilment (status, carrier, tracking number).
 * Vendors may only move their own items forward; admins may also correct an item.
 * The write is conditional on the item and the order being unchanged, so it cannot overwrite a
 * cancellation or another person's update (409 instead).
 */
export async function updateItemFulfilment(order, itemId, { status, carrier, trackingNumber }, actor) {
  if (order.status === "cancelled") throw new OrderError(400, "This order was cancelled");

  const item = order.orderItems.id(itemId);
  if (!item) throw new OrderError(404, "Order item not found");

  // scope "all": may fulfil anyone's items (admin); "own": only the items they sell
  const isOwner = item.vendor && item.vendor.toString() === actor.user._id.toString();
  if (actor.scope !== "all" && !(actor.scope === "own" && isOwner)) {
    throw new OrderError(403, "This item is not yours to fulfil");
  }
  if (item.status === "cancelled") throw new OrderError(400, "This item was cancelled");

  if (actor.scope !== "all" && status === "shipped" && order.refundRequest?.status === "pending") {
    throw new OrderError(409, "A refund is being reviewed for this order, so it cannot be shipped right now");
  }

  const set = {};
  let newStatus = item.status;

  if (status && status !== item.status) {
    if (["paid", "processing"].includes(item.payout?.status)) {
      throw new OrderError(400, "This item has already been paid out to its vendor, so its status can no longer change");
    }
    const allowed = actor.scope === "all" ? ["pending", "shipped", "delivered"] : NEXT_STATUS[item.status] || [];
    if (!allowed.includes(status)) {
      throw new OrderError(400, `Cannot change an item from ${item.status} to ${status}`);
    }
    newStatus = status;
    const now = new Date();
    set["orderItems.$.status"] = status;
    set["orderItems.$.shippedAt"] = status === "pending" ? null : item.shippedAt || now;
    set["orderItems.$.deliveredAt"] = status === "delivered" ? now : null;
  }

  const newCarrier = carrier !== undefined ? String(carrier).trim().slice(0, 60) : item.carrier;
  const newTracking = trackingNumber !== undefined ? String(trackingNumber).trim().slice(0, 80) : item.trackingNumber;
  if (carrier !== undefined) set["orderItems.$.carrier"] = newCarrier;
  if (trackingNumber !== undefined) set["orderItems.$.trackingNumber"] = newTracking;

  if (Object.keys(set).length === 0) return order; // nothing to change

  const result = await Order.updateOne(
    {
      _id: order._id,
      status: { $ne: "cancelled" },
      orderItems: { $elemMatch: { _id: item._id, status: item.status } },
    },
    { $set: set }
  );
  if (result.matchedCount === 0) throw new OrderError(409, CONFLICT);

  const updated = await applyDerivedStatus(order._id, [
    {
      status: newStatus,
      note: `${item.name}: ${newStatus}${newTracking ? ` (tracking ${newTracking})` : ""}`,
      by: actor.scope === "all" ? actor.role : actor.user.name,
      item: item._id,
    },
  ]);

  // paid after the holding period (or at once if it is 0); never makes the vendor wait for Stripe
  if (newStatus === "delivered") payoutDeliveredItems(order._id).catch((error) => console.error("Payout after delivery:", error.message));
  return updated;
}

// admin shortcut: move every active item of an order to the same status in one step
export async function setAllItemsStatus(orderId, status, by) {
  const now = new Date();

  const result = await Order.updateOne(
    { _id: orderId, status: { $ne: "cancelled" } },
    {
      $set: {
        "orderItems.$[i].status": status,
        "orderItems.$[i].shippedAt": status === "pending" ? null : now,
        "orderItems.$[i].deliveredAt": status === "delivered" ? now : null,
      },
    },
    // only items that would actually change: not cancelled, not already that status, not already paid out
    // timestamps off: Mongoose would otherwise touch updatedAt and make an empty change look like a change
    {
      timestamps: false,
      arrayFilters: [{ "i.status": { $nin: ["cancelled", status] }, "i.payout.status": { $nin: ["paid", "processing"] } }],
    }
  );
  if (result.matchedCount === 0) throw new OrderError(409, CONFLICT);

  // nothing changed (already that status, or everything already paid out): do not write a history entry for it
  if (result.modifiedCount === 0) return { order: await Order.findById(orderId), changed: false };

  const updated = await applyDerivedStatus(orderId, [{ status, note: `All items marked ${status}`, by }]);

  if (status === "delivered") payoutDeliveredItems(orderId).catch((error) => console.error("Payout after delivery:", error.message));
  return { order: updated, changed: true };
}

/* ------------------------------------------------------------------ staff refunds with limits and approval */

// true when there is no second admin who could approve (counts real, verified admin accounts, not config entries)
const singleAdmin = async () =>
  (await User.countDocuments({ email: { $in: adminEmailList() }, emailVerified: { $ne: false } })) < 2;

// the most a person may refund without someone else's approval
export const refundLimitFor = (role) => (role === "admin" ? REFUND_APPROVAL_OVER : SUPPORT_REFUND_LIMIT);

/**
 * Staff cancel an unshipped order and refund it. Within the person's limit it happens at once; above it, the
 * request waits for an admin who is not the one asking (the only admin may approve their own, since nobody else can).
 * Returns { done: true, order } or { done: false, order } when the refund is waiting for approval.
 */
export async function cancelAsStaff(orderId, { reason = "", actor }) {
  const order = await Order.findById(orderId);
  if (!order) throw new OrderError(404, "Order not found");

  if (order.status === "pending" && order.totalPrice > refundLimitFor(actor.role)) {
    if (order.refundRequest?.status === "pending") {
      throw new OrderError(409, "A refund for this order is already waiting for approval");
    }

    const result = await Order.updateOne(
      { _id: orderId, status: "pending", "refundRequest.status": { $ne: "pending" } },
      {
        $set: {
          refundRequest: {
            status: "pending",
            by: actor.user._id,
            byName: actor.user.name,
            reason: reason || "",
            at: new Date(),
          },
        },
      }
    );
    if (result.matchedCount === 0) throw new OrderError(409, CONFLICT);

    return { done: false, order: await Order.findById(orderId) };
  }

  return { done: true, order: await cancelOrder(orderId, { reason, by: actor.role }) };
}

/**
 * An admin approves or rejects a refund that was over the requester's limit.
 * The approver cannot be the person who asked, unless there is only one admin.
 */
export async function decideRefundRequest(orderId, decision, { actor, note = "" }) {
  const order = await Order.findById(orderId);
  const request = order?.refundRequest;
  if (!order) throw new OrderError(404, "Order not found");
  if (request?.status !== "pending") throw new OrderError(400, "There is no refund waiting for approval on this order");

  const sameAsRequester = request.by?.toString() === actor.user._id.toString();
  if (decision === "approve" && sameAsRequester && !(await singleAdmin())) {
    throw new OrderError(403, "A different admin has to approve this refund");
  }

  // claim the decision first, so two approvals cannot both refund
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, "refundRequest.status": "pending" },
    {
      $set: {
        "refundRequest.status": decision === "approve" ? "approved" : "rejected",
        "refundRequest.decidedBy": actor.user.name,
        "refundRequest.decidedAt": new Date(),
      },
    }
  );
  if (!claimed) throw new OrderError(409, CONFLICT);

  if (decision === "reject") {
    await Order.updateOne(
      { _id: orderId },
      { $push: { statusHistory: { status: order.status, note: `Refund request rejected${note ? `: ${note}` : ""}`, by: actor.user.name } } }
    );
    return Order.findById(orderId);
  }

  try {
    return await cancelOrder(orderId, { reason: request.reason || "", by: `${actor.role} (approved)` });
  } catch (error) {
    if (error.status === 502) {
      // Stripe could not refund right now: put the request back so it can be approved again
      await Order.updateOne({ _id: orderId }, { $set: { "refundRequest.status": "pending" }, $unset: { "refundRequest.decidedBy": "", "refundRequest.decidedAt": "" } });
    } else {
      // the order shipped or was cancelled meanwhile: the request can never be carried out, so close it
      await Order.updateOne(
        { _id: orderId },
        { $set: { "refundRequest.status": "rejected", "refundRequest.decidedBy": "system (order can no longer be refunded)" } }
      );
    }
    throw error;
  }
}
