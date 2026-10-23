import { Order } from "../models/order.model.js";
import { Product } from "../models/product.model.js";
import { stripe } from "../config/stripe.js";

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

const NEXT_STATUS = { pending: ["shipped", "delivered"], shipped: ["delivered"], delivered: [] };

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

  const isOwner = item.vendor && item.vendor.toString() === actor.user._id.toString();
  if (actor.role !== "admin" && !isOwner) throw new OrderError(403, "This item is not yours to fulfil");
  if (item.status === "cancelled") throw new OrderError(400, "This item was cancelled");

  const set = {};
  let newStatus = item.status;

  if (status && status !== item.status) {
    const allowed = actor.role === "admin" ? ["pending", "shipped", "delivered"] : NEXT_STATUS[item.status] || [];
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

  return applyDerivedStatus(order._id, [
    {
      status: newStatus,
      note: `${item.name}: ${newStatus}${newTracking ? ` (tracking ${newTracking})` : ""}`,
      by: actor.role === "admin" ? "admin" : actor.user.name,
      item: item._id,
    },
  ]);
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
    { arrayFilters: [{ "i.status": { $ne: "cancelled" } }] }
  );
  if (result.matchedCount === 0) throw new OrderError(409, CONFLICT);

  return applyDerivedStatus(orderId, [{ status, note: `All items marked ${status}`, by }]);
}
