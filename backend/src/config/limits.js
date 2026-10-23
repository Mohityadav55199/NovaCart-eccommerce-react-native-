// Business rules for money-moving actions and vendor trust. Every number can be overridden by an env var.
const num = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

// support can refund up to this much on their own; more needs an admin's approval
export const SUPPORT_REFUND_LIMIT = num("SUPPORT_REFUND_LIMIT", 100);

// a refund over this needs a second person: an admin other than whoever asked for it
export const REFUND_APPROVAL_OVER = num("REFUND_APPROVAL_OVER", 500);

// a vendor's products need admin approval until this many of them have been approved
export const TRUSTED_AFTER_APPROVED = num("TRUSTED_AFTER_APPROVED", 3);

// share of each delivered item's price kept by the platform; the vendor gets the rest
export const PLATFORM_FEE_PERCENT = Math.min(num("PLATFORM_FEE_PERCENT", 10), 100);

// a delivered item is paid out to its vendor after this many hours (0 = at once), so a wrong delivery can still be corrected
export const PAYOUT_HOLD_HOURS = num("PAYOUT_HOLD_HOURS", 72);

// ask Clerk to re-verify the person's identity before refunds and role changes (needs testing with your Clerk
// instance first, so it is off until you set REQUIRE_REVERIFICATION=true)
export const REQUIRE_REVERIFICATION = process.env.REQUIRE_REVERIFICATION === "true";
