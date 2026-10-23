import express from "express";
import fs from "fs";
import path from "path";
import { clerkMiddleware } from "@clerk/express";
import { serve } from "inngest/express";
import cors from "cors";

import { functions, inngest } from "./config/inngest.js";

import { ENV } from "./config/env.js";
import { connectDB } from "./config/db.js";

import adminRoutes from "./routes/admin.route.js";
import userRoutes from "./routes/user.route.js";
import orderRoutes from "./routes/order.route.js";
import reviewRoutes from "./routes/review.route.js";
import productRoutes from "./routes/product.route.js";
import cartRoutes from "./routes/cart.route.js";
import paymentRoutes from "./routes/payment.route.js";

const app = express();

const __dirname = path.resolve();

// special handling: Stripe webhook needs raw body BEFORE any body parsing middleware
// apply raw body parser conditionally only to webhook endpoint
app.use("/api/payment/webhook", express.raw({ type: "application/json" }));

app.use(express.json());
// CLIENT_URL may hold several comma-separated origins. Each one is cleaned (quotes, spaces, stray
// non-ASCII characters and a trailing slash from copy-paste) because a bad character in this value
// makes the cors package throw on every request.
const allowedOrigins = (ENV.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.replace(/[^!-~]/g, "").replace(/^["']|["']$/g, "").replace(/\/+$/, ""))
  .filter(Boolean);

app.use(
  cors({
    // no Origin header = not a browser (curl, Stripe webhook, mobile app): allow
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
    credentials: true, // lets the browser send cookies with the request
  })
);

// adds the auth object under req.auth; Stripe's webhook is verified by its signature instead
app.use((req, res, next) =>
  req.originalUrl === "/api/payment/webhook" ? next() : clerkMiddleware()(req, res, next)
);

app.use("/api/inngest", serve({ client: inngest, functions }));

app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/payment", paymentRoutes);

app.get("/api/health", (req, res) => {
  res.status(200).json({ message: "Success" });
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
};

startServer();
