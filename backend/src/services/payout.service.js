import { Order } from "../models/order.model.js";
import { User } from "../models/user.model.js";
import { stripe } from "../config/stripe.js";
import { PAYOUT_HOLD_HOURS, PLATFORM_FEE_PERCENT } from "../config/limits.js";

const toCents = (dollars) => Math.round(dollars * 100);

// a delivered item's price is split into the platform's fee and the vendor's share (shipping and tax stay with the platform)
export function splitAmount(item) {
  const gross = toCents(item.price * item.quantity);
  const fee = Math.round((gross * PLATFORM_FEE_PERCENT) / 100);
  return { gross, fee, net: gross - fee };
}

// a payout that has been "processing" this long was interrupted (restart, crash) and may be picked up again
const STALE_MS = 10 * 60 * 1000;

// matches an item only while nobody has paid it and nobody is paying it right now
const claimable = (itemId) => ({
  orderItems: {
    $elemMatch: {
      _id: itemId,
      $or: [
        { "payout.status": { $nin: ["paid", "processing"] } },
        { "payout.status": "processing", "payout.claimedAt": { $lt: new Date(Date.now() - STALE_MS) } },
      ],
    },
  },
});

const isOpen = (payout) =>
  payout?.status === "paid" ||
  (payout?.status === "processing" && payout.claimedAt && Date.now() - new Date(payout.claimedAt).getTime() < STALE_MS);

// Delivered items are paid only after a short holding period, so a wrongly delivered item can still be corrected.
const holdPassed = (item) =>
  PAYOUT_HOLD_HOURS <= 0 ||
  (item.deliveredAt && Date.now() - new Date(item.deliveredAt).getTime() >= PAYOUT_HOLD_HOURS * 3600 * 1000);

// a transfer we already made for this item (the "paid" write may have failed after Stripe accepted it)
async function findExistingTransfer(orderId, itemId) {
  const list = await stripe.transfers.list({ transfer_group: `order_${orderId}`, limit: 100 });
  return list.data.find((transfer) => transfer.metadata?.itemId === String(itemId) && !transfer.reversed);
}

/**
 * Pays the vendor their share of ONE delivered item through Stripe Connect. Safe to call again and again:
 * the item is claimed atomically ("processing"), an interrupted attempt is recovered after a few minutes,
 * and a transfer that already exists on Stripe is reused instead of being created twice.
 *
 * No connected account yet -> the share waits ("waiting_for_account") and is paid once the vendor finishes
 * setting up payouts (see settleVendorPayouts).
 */
export async function payoutItem(orderId, itemId) {
  const order = await Order.findById(orderId);
  const item = order?.orderItems.id(itemId);
  if (!item || item.status !== "delivered" || !item.vendor) return null;
  if (isOpen(item.payout)) return item.payout;
  if (!holdPassed(item)) return { status: "none", releasesAfterHold: true };

  const { fee, net } = splitAmount(item);
  const vendor = await User.findById(item.vendor).select("vendorProfile");
  const accountId = vendor?.vendorProfile?.stripeAccountId;

  if (!accountId) {
    await Order.updateOne(
      { _id: orderId, ...claimable(itemId) },
      {
        $set: {
          "orderItems.$.payout.status": "waiting_for_account",
          "orderItems.$.payout.amount": net / 100,
          "orderItems.$.payout.fee": fee / 100,
        },
      }
    );
    return { status: "waiting_for_account" };
  }

  const attemptId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, ...claimable(itemId) },
    {
      $set: {
        "orderItems.$.payout.status": "processing",
        "orderItems.$.payout.claimedAt": new Date(),
        "orderItems.$.payout.attemptId": attemptId,
        "orderItems.$.payout.amount": net / 100,
        "orderItems.$.payout.fee": fee / 100,
        "orderItems.$.payout.error": "",
      },
    }
  );
  if (!claimed) return null; // someone else is paying it out

  let transfer;
  try {
    // an earlier attempt may have paid it without being able to say so: never pay twice
    transfer = await findExistingTransfer(orderId, itemId);

    if (!transfer) {
      const intent = await stripe.paymentIntents.retrieve(order.paymentResult.id);
      transfer = await stripe.transfers.create(
        {
          amount: net,
          currency: "usd",
          destination: accountId,
          transfer_group: `order_${orderId}`,
          // paid out of this customer's charge, so it works even before the platform balance is available
          source_transaction: typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id,
          metadata: { orderId: String(orderId), itemId: String(itemId), vendorId: String(item.vendor) },
        },
        // one key per attempt: a failed attempt must not replay its error for the next 24 hours
        { idempotencyKey: `payout-${orderId}-${itemId}-${attemptId}` }
      );
    }
  } catch (error) {
    console.error("Vendor payout failed:", error.message);
    await Order.updateOne(
      { _id: orderId, "orderItems._id": itemId },
      { $set: { "orderItems.$.payout.status": "failed", "orderItems.$.payout.error": String(error.message).slice(0, 300) } }
    );
    return { status: "failed", error: error.message };
  }

  // the money has moved. If this write fails the item stays "processing" and the next attempt finds the transfer above.
  await Order.updateOne(
    { _id: orderId, "orderItems._id": itemId },
    { $set: { "orderItems.$.payout.status": "paid", "orderItems.$.payout.transferId": transfer.id, "orderItems.$.payout.at": new Date() } }
  );
  return { status: "paid", transferId: transfer.id };
}

// pays every delivered item of an order that is due (called after a delivery and by the sweeper)
export async function payoutDeliveredItems(orderId) {
  const order = await Order.findById(orderId);
  if (!order) return;
  for (const item of order.orderItems) {
    if (item.status === "delivered" && item.vendor && !isOpen(item.payout)) {
      await payoutItem(orderId, item._id).catch((error) => console.error("payoutItem:", error.message));
    }
  }
}

const DUE_OR_RETRYABLE = ["none", "waiting_for_account", "failed", "processing"];

// retries everything a vendor is owed: waiting for their account, held, failed earlier, or interrupted
export async function settleVendorPayouts(vendorId) {
  const orders = await Order.find({
    orderItems: { $elemMatch: { vendor: vendorId, status: "delivered", "payout.status": { $in: DUE_OR_RETRYABLE } } },
  }).select("_id");

  for (const order of orders) await payoutDeliveredItems(order._id);
}

// Pays what is due for every vendor: held items whose holding period has ended, and retries. Runs on a timer.
export async function settleAllDuePayouts() {
  const orders = await Order.find({
    orderItems: { $elemMatch: { status: "delivered", vendor: { $exists: true }, "payout.status": { $in: DUE_OR_RETRYABLE } } },
  }).select("_id");

  for (const order of orders) await payoutDeliveredItems(order._id);
  return orders.length;
}
