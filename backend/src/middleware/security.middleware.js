import rateLimit from "express-rate-limit";

// Per-IP limits. Behind Render's proxy `trust proxy` makes req.ip the real client address (see server.js).
const base = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down and try again in a moment." },
};

// Stripe and Clerk call the webhooks in bursts from a few addresses, and the keep-alive ping hits /health
const exempt = (req) => /^\/api\/(payment\/webhook|webhooks\/|health)/.test(req.originalUrl);

// everything under /api
export const apiLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 300, skip: exempt });

// becoming a vendor: a handful per hour is plenty for a person
export const becomeVendorLimiter = rateLimit({ ...base, windowMs: 60 * 60 * 1000, limit: 10 });

// creating payment intents (each one talks to Stripe)
export const checkoutLimiter = rateLimit({ ...base, windowMs: 10 * 60 * 1000, limit: 30 });
