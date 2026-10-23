import mongoose from "mongoose";
import { ENV } from "./env.js";

export const connectDB = async () => {
  // already connected (e.g. when called again from an Inngest function)
  if (mongoose.connection.readyState === 1) return;

  const conn = await mongoose.connect(ENV.DB_URL);
  console.log(`✅ Connected to MONGODB: ${conn.connection.host}`);
};
