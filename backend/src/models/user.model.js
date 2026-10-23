import mongoose from "mongoose";

const addressSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
  },
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
  isDefault: {
    type: Boolean,
    default: false,
  },
});

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
      default: "",
    },
    clerkId: {
      type: String,
      unique: true,
      required: true,
    },
    stripeCustomerId: {
      type: String,
      default: "",
    },
    // everyone is a customer; "vendor" is added when they start selling (anyone can).
    // "admin" is never stored: admins are the emails in ADMIN_EMAIL (see auth.middleware.js)
    // "support" is given by an admin (sees orders and customers, refunds up to a limit)
    roles: {
      type: [String],
      enum: ["customer", "vendor", "support"],
      default: ["customer"],
    },
    // the primary email as Clerk last reported it. Admin access depends on it, so it is only trusted while
    // Clerk says it is verified, and it is refreshed from Clerk regularly (see auth.middleware.js)
    emailVerified: { type: Boolean, default: true },
    emailCheckedAt: Date,
    vendorProfile: {
      storeName: { type: String, trim: true, maxlength: 60 },
      since: Date,
      // set when an admin removes the vendor role: stops people re-granting it to themselves
      suspended: { type: Boolean, default: false },
      // an admin paused selling: products are hidden and no new ones can be added, but open orders can be shipped
      paused: { type: Boolean, default: false },
      // the vendor's Stripe Connect account that receives their share of each delivered item
      stripeAccountId: { type: String, default: "" },
    },
    addresses: [addressSchema],
    wishlist: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
