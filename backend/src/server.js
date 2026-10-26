import express from "express";
import fs from "fs";
import path from "path";
import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import helmet from "helmet";

import { ENV } from "./config/env.js";
import { connectDB } from "./config/db.js";

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
import { settleAllDuePayouts } from "./services/payout.service.js";

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
  console.error("Unhandled error:", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || "Internal server error",
  });
});

// make our app ready for deployment
const adminDist = path.join(__dirname, "../admin/dist");
if (ENV.NODE_ENV === "production" && fs.existsSync(adminDist)) {
  app.use(express.static(adminDist));

  app.get("/{*any}", (req, res) => {
    res.sendFile(path.join(adminDist, "index.html"));
  });
}

const startServer = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error("MONGODB connection error:", error.message);
    process.exit(1); // exit code 1 means failure, 0 means success
  }
  app.listen(ENV.PORT, () => {
    console.log("Server is up and running");
  });
  // pays vendors whose holding period has ended, and retries payouts that failed or were interrupted
  const sweep = () => settleAllDuePayouts().catch((error) => console.error("Payout sweep failed:", error.message));
  setTimeout(sweep, 60 * 1000);
  setInterval(sweep, 30 * 60 * 1000).unref();
};

startServer();
