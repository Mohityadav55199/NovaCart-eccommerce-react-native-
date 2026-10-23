import mongoose from "mongoose";

export const ITEM_STATUSES = ["pending", "shipped", "delivered", "cancelled"];
export const ORDER_STATUSES = ["pending", "shipped", "delivered", "cancelled"];

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  // who has to ship this item (null for store-owned products)
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  image: {
    type: String,
    default: "",
  },
  // each vendor ships its own items, so fulfilment is tracked per item
  status: {
    type: String,
    enum: ITEM_STATUSES,
    default: "pending",
  },
  carrier: { type: String, default: "" },
  trackingNumber: { type: String, default: "" },
  shippedAt: Date,
  deliveredAt: Date,
});

const shippingAddressSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
  },
  streetAddress: {
    type: String,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  zipCode: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
    required: true,
  },
});

const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    note: { type: String, default: "" },
    by: { type: String, default: "system" }, // "customer" | "admin" | vendor name | "system"
    item: { type: mongoose.Schema.Types.ObjectId }, // set when the event is about one item (vendors only see their own)
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clerkId: {
      type: String,
      required: true,
    },
    orderItems: [orderItemSchema],
    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },
    paymentResult: {
      id: String,
      status: String, // "succeeded" | "refunded"
    },
    pricing: {
      subtotal: Number,
      shipping: Number,
      tax: Number,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    // derived from the items: see recomputeStatus()
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "pending",
    },
    statusHistory: [statusEventSchema],
    cancellation: {
      reason: String,
      by: String,
      at: Date,
      refundId: String,
      refundAmount: Number,
    },
    deliveredAt: {
      type: Date,
    },
    shippedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// one order per Stripe payment (sparse: orders without a payment id are allowed)
orderSchema.index({ "paymentResult.id": 1 }, { unique: true, sparse: true });
orderSchema.index({ "orderItems.vendor": 1 });

// order status from its items: cancelled when all are cancelled, delivered when every active item is
// delivered, shipped once any active item has shipped, otherwise pending
orderSchema.methods.recomputeStatus = function () {
  const active = this.orderItems.filter((item) => item.status !== "cancelled");

  let next;
  if (active.length === 0) next = "cancelled";
  else if (active.every((item) => item.status === "delivered")) next = "delivered";
  else if (active.some((item) => item.status === "shipped" || item.status === "delivered")) next = "shipped";
  else next = "pending";

  const changed = next !== this.status;
  this.status = next;

  // dates follow the status, so correcting an order backwards clears the later dates
  if (next === "pending" || next === "cancelled") {
    this.shippedAt = undefined;
    this.deliveredAt = undefined;
  }
  if (next === "shipped") {
    if (!this.shippedAt) this.shippedAt = new Date();
    this.deliveredAt = undefined;
  }
  if (next === "delivered") {
    if (!this.shippedAt) this.shippedAt = new Date();
    if (!this.deliveredAt) this.deliveredAt = new Date();
  }

  return changed;
};

export const Order = mongoose.model("Order", orderSchema);
