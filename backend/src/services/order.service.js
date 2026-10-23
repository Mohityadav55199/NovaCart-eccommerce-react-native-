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

/**
 * Cancels an order that has not shipped yet: refunds the full payment on Stripe, puts the stock back
 * and records who cancelled it and why.
 *
 * Safe to call twice at once: the first call atomically claims the order (pending -> cancelled),
 * so the refund and the restock can only happen once.
 */
export async function cancelOrder(orderId, { reason = "", by }) {
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, status: "pending" },
    { $set: { status: "cancelled" } },
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
    // nothing was refunded, so give the order back to the customer as it was
    await Order.updateOne({ _id: claimed._id }, { $set: { status: "pending" } });
    console.error("Stripe refund failed:", error.message);
    throw new OrderError(502, "The refund could not be processed. The order was not cancelled, please try again.");
  }

  const order = await Order.findById(claimed._id);
  order.orderItems.forEach((item) => {
    item.status = "cancelled";
  });
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

const NEXT_STATUS = { pending: ["shipped", "delivered"], shipped: ["delivered"], delivered: [] };

/**
 * Updates one order item's fulfilment (status, carrier, tracking number).
 * Vendors may only move their own items forward; admins may also correct an item.
 */
export async function updateItemFulfilment(order, itemId, { status, carrier, trackingNumber }, actor) {
  if (order.status === "cancelled") throw new OrderError(400, "This order was cancelled");

  const item = order.orderItems.id(itemId);
  if (!item) throw new OrderError(404, "Order item not found");

  const isOwner = item.vendor && item.vendor.toString() === actor.user._id.toString();
  if (actor.role !== "admin" && !isOwner) throw new OrderError(403, "This item is not yours to fulfil");
  if (item.status === "cancelled") throw new OrderError(400, "This item was cancelled");

  if (status && status !== item.status) {
    const allowed = actor.role === "admin" ? ["pending", "shipped", "delivered"] : NEXT_STATUS[item.status] || [];
    if (!allowed.includes(status)) {
      throw new OrderError(400, `Cannot change an item from ${item.status} to ${status}`);
    }
    item.status = status;
    if (status === "shipped") item.shippedAt = item.shippedAt || new Date();
    if (status === "delivered") {
      item.shippedAt = item.shippedAt || new Date();
      item.deliveredAt = new Date();
    }
    if (status === "pending") {
      item.shippedAt = undefined;
      item.deliveredAt = undefined;
    }
  }

  if (carrier !== undefined) item.carrier = String(carrier).trim().slice(0, 60);
  if (trackingNumber !== undefined) item.trackingNumber = String(trackingNumber).trim().slice(0, 80);

  const changed = order.recomputeStatus();
  order.statusHistory.push({
    status: item.status,
    note: `${item.name}: ${item.status}${item.trackingNumber ? ` (tracking ${item.trackingNumber})` : ""}`,
    by: actor.role === "admin" ? "admin" : actor.user.name,
  });
  if (changed) {
    order.statusHistory.push({ status: order.status, note: `Order is now ${order.status}`, by: "system" });
  }

  await order.save();
  return order;
}

// admin shortcut: move every active item of an order to the same status in one step
export function setAllItemsStatus(order, status, by) {
  const now = new Date();

  order.orderItems.forEach((item) => {
    if (item.status === "cancelled") return;
    item.status = status;
    item.shippedAt = status === "pending" ? undefined : item.shippedAt || now;
    item.deliveredAt = status === "delivered" ? item.deliveredAt || now : undefined;
  });

  const changed = order.recomputeStatus();
  order.statusHistory.push({ status, note: `All items marked ${status}`, by });
  if (changed) order.statusHistory.push({ status: order.status, note: `Order is now ${order.status}`, by: "system" });
}
