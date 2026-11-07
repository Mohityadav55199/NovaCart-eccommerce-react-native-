import app from "./app.js";
import { ENV } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { settleAllDuePayouts } from "./services/payout.service.js";

// without these the API cannot work: fail at start with a clear message instead of a vague error on the first request
const REQUIRED = ["DB_URL", "CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];
const missing = REQUIRED.filter((name) => !ENV[name]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const startServer = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error("MONGODB connection error:", error.message);
    process.exit(1); // exit code 1 means failure, 0 means success
  }
  const server = app.listen(ENV.PORT || 3000, () => {
    console.log("Server is up and running");
  });

  // pays vendors whose holding period has ended, and retries payouts that failed or were interrupted
  const sweep = () => settleAllDuePayouts().catch((error) => console.error("Payout sweep failed:", error.message));
  setTimeout(sweep, 60 * 1000).unref();
  setInterval(sweep, 30 * 60 * 1000).unref();

  // Render sends SIGTERM on every deploy and spin-down: finish in-flight requests (e.g. a payment webhook) first
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10 * 1000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

startServer();
