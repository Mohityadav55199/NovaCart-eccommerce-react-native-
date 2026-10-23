import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    category: {
      type: String,
      required: true,
    },
    images: [
      {
        type: String,
        required: true,
      },
    ],
    // pending: waiting for an admin; approved: on sale; rejected: not allowed; paused: its vendor was paused.
    // Only "approved" products are shown in the shop and can be bought.
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "paused"],
      default: "approved",
    },
    reviewNote: { type: String, default: "" },
    // the vendor who sells it; empty for store-owned products
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    averageRating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

productSchema.index({ vendor: 1 });
productSchema.index({ status: 1 });

export const Product = mongoose.model("Product", productSchema);
