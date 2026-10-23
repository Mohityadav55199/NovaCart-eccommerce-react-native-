import { stripe } from "../config/stripe.js";
import { ENV } from "../config/env.js";
import { PLATFORM_FEE_PERCENT } from "../config/limits.js";
import { Order } from "../models/order.model.js";
import { settleVendorPayouts } from "../services/payout.service.js";

const NOT_ENABLED =
  "Payouts are not switched on for this store yet. The store owner has to turn on Stripe Connect first.";

// Stripe answers this way when Connect has not been enabled on the platform's Stripe account
const isConnectDisabled = (error) => /signed up for connect/i.test(error?.message || "");

const siteUrl = () => (ENV.CLIENT_URL || "").split(",")[0].trim().replace(/\/+$/, "");

// starts (or continues) the vendor's Stripe onboarding: returns a link to Stripe's hosted form
export async function connectPayouts(req, res) {
  try {
    const user = req.user;
    if (!user.roles.includes("vendor")) return res.status(403).json({ error: "Only vendors receive payouts" });

    let accountId = user.vendorProfile?.stripeAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email,
        capabilities: { transfers: { requested: true } },
        business_profile: { name: user.vendorProfile?.storeName || user.name },
        metadata: { userId: user._id.toString() },
      });
      accountId = account.id;
      user.set("vendorProfile.stripeAccountId", accountId);
      await user.save();
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${siteUrl()}/payouts`,
      return_url: `${siteUrl()}/payouts?connected=1`,
      type: "account_onboarding",
    });

    res.status(200).json({ url: link.url });
  } catch (error) {
    if (isConnectDisabled(error)) return res.status(503).json({ error: NOT_ENABLED });
    console.error("Error in connectPayouts:", error.message);
    res.status(500).json({ error: "Could not start payout setup. Please try again." });
  }
}

const sum = (rows, status, field) => rows.filter((row) => row._id === status).reduce((total, row) => total + (row[field] || 0), 0);

// A vendor sees their earnings and payout account; an admin sees the platform totals.
export async function getPayouts(req, res) {
  try {
    const all = req.scope("payouts:view") === "all";
    const vendorId = req.user._id;
    const itemMatch = all ? { "orderItems.status": "delivered" } : { "orderItems.vendor": vendorId, "orderItems.status": "delivered" };

    let account = { connected: false, payoutsEnabled: false, detailsSubmitted: false };

    if (!all) {
      const accountId = req.user.vendorProfile?.stripeAccountId;
      if (accountId) {
        try {
          const stripeAccount = await stripe.accounts.retrieve(accountId);
          account = {
            connected: true,
            payoutsEnabled: !!stripeAccount.payouts_enabled,
            detailsSubmitted: !!stripeAccount.details_submitted,
          };
          // setup finished: pay anything that was waiting for the account (or failed earlier)
          // (in the background: a page view must not wait for Stripe transfers)
          if (stripeAccount.payouts_enabled) settleVendorPayouts(vendorId).catch((error) => console.error("settle:", error.message));
        } catch (error) {
          console.error("Could not read the Stripe account:", error.message);
          account = { connected: true, payoutsEnabled: false, detailsSubmitted: false, error: "Could not reach Stripe" };
        }
      }
    }

    const rows = await Order.aggregate([
      { $unwind: "$orderItems" },
      { $match: itemMatch },
      {
        $group: {
          _id: "$orderItems.payout.status",
          count: { $sum: 1 },
          gross: { $sum: { $multiply: ["$orderItems.price", "$orderItems.quantity"] } },
          net: { $sum: "$orderItems.payout.amount" },
          fee: { $sum: "$orderItems.payout.fee" },
        },
      },
    ]);

    const recentOrders = await Order.find({
      orderItems: { $elemMatch: all ? { status: "delivered" } : { vendor: vendorId, status: "delivered" } },
    })
      .sort({ updatedAt: -1 })
      .limit(20);

    const recent = recentOrders.flatMap((order) =>
      order.orderItems
        .filter((item) => item.status === "delivered" && (all || item.vendor?.toString() === vendorId.toString()))
        .map((item) => ({
          orderId: order._id,
          name: item.name,
          quantity: item.quantity,
          gross: item.price * item.quantity,
          net: item.payout?.amount ?? null,
          fee: item.payout?.fee ?? null,
          status: item.payout?.status || "none",
          at: item.payout?.at || item.deliveredAt,
          error: item.payout?.error || undefined,
        }))
    );

    res.status(200).json({
      scope: all ? "platform" : "vendor",
      feePercent: PLATFORM_FEE_PERCENT,
      account,
      totals: {
        paid: sum(rows, "paid", "net"),
        waiting: sum(rows, "waiting_for_account", "net") + sum(rows, "none", "net") + sum(rows, "processing", "net"),
        failed: sum(rows, "failed", "net"),
        platformFees: sum(rows, "paid", "fee"),
      },
      recent,
    });
  } catch (error) {
    console.error("Error in getPayouts:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

