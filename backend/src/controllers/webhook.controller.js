import { verifyWebhook } from "@clerk/express/webhooks";
import { Order } from "../models/order.model.js";
import { Product } from "../models/product.model.js";
import { User } from "../models/user.model.js";
import { buildUserDoc } from "../utils/user.js";
import { setVendorProductsHidden } from "../services/vendor.service.js";

const primaryEmailOf = (data) => {
  const list = data.email_addresses || [];
  return list.find((entry) => entry.id === data.primary_email_address_id) || list[0];
};

// creates or updates our user record from a Clerk user, keeping the verified primary email current
async function upsertUser(data) {
  const primary = primaryEmailOf(data);
  if (!primary?.email_address) return;

  const fields = {
    email: primary.email_address,
    emailVerified: primary.verification?.status === "verified",
    emailCheckedAt: new Date(),
    imageUrl: data.image_url || "",
  };
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ");

  const existing = await User.findOne({ clerkId: data.id });
  if (existing) {
    Object.assign(existing, fields);
    if (name) existing.name = name;
    try {
      await existing.save();
    } catch (error) {
      // the new email belongs to another record: keep ours and say so, instead of failing the webhook forever
      if (error.code !== 11000) throw error;
      console.error(`Clerk webhook: email ${fields.email} is already used by another user, left unchanged`);
    }
    return;
  }

  try {
    await User.create({
      ...buildUserDoc({
        clerkId: data.id,
        email: fields.email,
        firstName: data.first_name,
        lastName: data.last_name,
        imageUrl: fields.imageUrl,
      }),
      emailVerified: fields.emailVerified,
      emailCheckedAt: fields.emailCheckedAt,
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    // created meanwhile by a request: just bring it up to date
    await User.updateOne({ clerkId: data.id }, { $set: fields });
    // the same email under an older Clerk account (deleted and re-created): only a VERIFIED email may take the record over
    if (fields.emailVerified) {
      await User.updateOne({ email: fields.email, clerkId: { $ne: data.id } }, { $set: { clerkId: data.id, ...fields } });
    }
  }
}

// A deleted Clerk account: remove our record when nothing depends on it. If it has orders, keep the record
// (the orders and the money trail refer to it) but strip the personal data and any selling.
async function removeUser(clerkId) {
  const user = await User.findOne({ clerkId });
  if (!user) return;

  // orders they placed, and orders where they are the seller (their payouts and the orders still point at them)
  const hasOrders = await Order.exists({ $or: [{ user: user._id }, { "orderItems.vendor": user._id }] });
  if (!hasOrders) {
    await Product.updateMany({ vendor: user._id, status: { $in: ["approved", "pending"] } }, { $set: { status: "paused" } });
    await User.deleteOne({ _id: user._id });
    return;
  }

  await setVendorProductsHidden(user._id, true);
  user.set({
    clerkId: `deleted_${clerkId}`,
    email: `deleted-${clerkId}@deleted.invalid`,
    name: "Deleted user",
    imageUrl: "",
    roles: ["customer"],
    emailVerified: false,
    addresses: [],
    wishlist: [],
  });
  user.set("vendorProfile.suspended", true);
  await user.save();
}

// Clerk calls this when a person signs up, changes their profile or deletes their account.
// Add it in Clerk: Configure > Webhooks > Add endpoint (user.created, user.updated, user.deleted),
// then put its signing secret in CLERK_WEBHOOK_SIGNING_SECRET.
export async function handleClerkWebhook(req, res) {
  let event;
  try {
    event = await verifyWebhook(req);
  } catch (error) {
    console.error("Clerk webhook verification failed:", error.message);
    return res.status(400).send("Webhook verification failed");
  }

  try {
    if (event.type === "user.created" || event.type === "user.updated") await upsertUser(event.data);
    else if (event.type === "user.deleted" && event.data?.id) await removeUser(event.data.id);

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Clerk webhook failed:", error);
    // non-2xx: Clerk retries the delivery
    res.status(500).json({ error: "Failed to process the event" });
  }
}
