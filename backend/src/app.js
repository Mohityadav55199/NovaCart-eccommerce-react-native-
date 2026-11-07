import express from "express";
import fs from "fs";
import path from "path";
import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";

import { ENV } from "./config/env.js";

import adminRoutes from "./routes/admin.route.js";
import userRoutes from "./routes/user.route.js";
import orderRoutes from "./routes/order.route.js";
import reviewRoutes from "./routes/review.route.js";
import productRoutes from "./routes/product.route.js";
import cartRoutes from "./routes/cart.route.js";
import paymentRoutes from "./routes/payment.route.js";
import vendorRoutes from "./routes/vendor.route.js";
import { handleClerkWebhook } from "./controllers/webhook.controller.js";
import { apiLimiter } from "./middleware/security.middleware.js";

const app = express();

const __dirname = path.resolve();

// behind Render's proxy: use the real client IP (rate limits) and know the request was https
app.set("trust proxy", 1);

// standard security headers. No CSP: this is a JSON API, and Clerk's scripts must keep working if the admin is served from here
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));

// special handling: Stripe webhook needs raw body BEFORE any body parsing middleware
// apply raw body parser conditionally only to webhook endpoint
app.use("/api/payment/webhook", express.raw({ type: "application/json" }));
// Clerk's webhook is verified from the raw body as well
app.use("/api/webhooks/clerk", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "100kb" }));
// CLIENT_URL may hold several comma-separated origins. Each one is cleaned (quotes, spaces, stray
// non-ASCII characters and a trailing slash from copy-paste) because a bad character in this value
// makes the cors package throw on every request.
const allowedOrigins = (ENV.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.replace(/[^!-~]/g, "").replace(/^["']|["']$/g, "").replace(/\/+$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // no Origin header = not a browser (curl, Stripe webhook, mobile app): allow
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // In development, also permit any localhost / 127.0.0.1 origin (e.g. 127.0.0.1:5173 or other ports)
      if (ENV.NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true, // lets the browser send cookies with the request
  })
);

// adds the auth object under req.auth; Stripe's webhook is verified by its signature instead
const clerk = clerkMiddleware();
const skipClerk = new Set(["/api/payment/webhook", "/api/webhooks/clerk", "/api/health"]);
app.use((req, res, next) => (skipClerk.has(req.originalUrl) ? next() : clerk(req, res, next)));

app.use("/api", apiLimiter);

// signed by Clerk (svix), so no login is needed: it keeps our user records in sync with Clerk
app.post("/api/webhooks/clerk", handleClerkWebhook);

app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/vendor", vendorRoutes);

app.get("/api/health", (req, res) => {
  res.status(200).json({ message: "Success" });
});

// 404 handler for unmapped API routes
app.all("/api/{*any}", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// centralized error handler
app.use((err, req, res, next) => {
  // a bad upload (wrong type, too big, too many files) is the client's mistake, not a server error
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Image is too large (5MB max)" : err.message });
  }
  if (err?.message?.startsWith("Only image files are allowed")) {
    return res.status(400).json({ error: err.message });
  }

  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error("Unhandled error:", err);
  // never leak internal details of a server error to the client
  res.status(status).json({ error: status >= 500 ? "Internal server error" : err.message || "Request failed" });
});

// make our app ready for deployment
const adminDist = path.join(__dirname, "../admin/dist");
if (ENV.NODE_ENV === "production" && fs.existsSync(adminDist)) {
  app.use(express.static(adminDist));

  app.get("/{*any}", (req, res) => {
    res.sendFile(path.join(adminDist, "index.html"));
  });
}

export default app;
