import { ENV } from "../config/env.js";
import { User } from "../models/user.model.js";
import { Product } from "../models/product.model.js";
import { Order } from "../models/order.model.js";
import { stripe } from "../config/stripe.js";
import { computePricing } from "../config/pricing.js";
import { MAX_METADATA_KEYS, packMeta, unpackMeta } from "../utils/stripeMeta.js";

const ADDRESS_FIELDS = ["fullName", "streetAddress", "city", "state", "zipCode", "phoneNumber"];

export async function createPaymentIntent(req, res) {
  try {
    const { cartItems, shippingAddress } = req.body;
    const user = req.user;

    // Validate cart items
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    if (!shippingAddress || ADDRESS_FIELDS.some((field) => !shippingAddress[field])) {
      return res.status(400).json({ error: "A complete shipping address is required" });
    }

    // one line per product, even if the client sent the same product twice
    const quantities = new Map();
    for (const item of cartItems) {
      const quantity = Number(item?.quantity);
      if (!item?.product?._id || !Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ error: "Invalid cart item" });
      }
      const id = String(item.product._id);
      quantities.set(id, (quantities.get(id) || 0) + quantity);
    }

    // Calculate total from server-side (don't trust client - ever.)
    let subtotal = 0;
    const validatedItems = [];

    for (const [id, quantity] of quantities) {
      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ error: "A product in your cart is no longer available" });
      }

      if (product.stock < quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
      }

      subtotal += product.price * quantity;
      // compact on purpose: product id, quantity and the price charged
      validatedItems.push({ p: product._id.toString(), q: quantity, pr: product.price });
    }

    const address = {};
    for (const field of ADDRESS_FIELDS) address[field] = String(shippingAddress[field]);

    const metadata = {
      clerkId: user.clerkId,
      userId: user._id.toString(),
      totalPrice: "", // set below, once the total is known
      ...packMeta("items", JSON.stringify(validatedItems)),
      ...packMeta("address", JSON.stringify(address)),
    };
    if (Object.keys(metadata).length > MAX_METADATA_KEYS) {
      return res.status(400).json({ error: "Too many items or address too long for one order" });
    }

    const { shipping, tax, total } = computePricing(subtotal);

    if (total <= 0) {
      return res.status(400).json({ error: "Invalid order total" });
    }
    metadata.totalPrice = total.toFixed(2);

    // find or create the stripe customer
    let customer;
    if (user.stripeCustomerId) {
      // find the customer
      customer = await stripe.customers.retrieve(user.stripeCustomerId);
    } else {
      // create the customer
      customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          clerkId: user.clerkId,
          userId: user._id.toString(),
        },
      });

      // add the stripe customer ID to the  user object in the DB
      await User.findByIdAndUpdate(user._id, { stripeCustomerId: customer.id });
    }

    // create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100), // convert to cents
      currency: "usd",
      customer: customer.id,
      automatic_payment_methods: {
        enabled: true,
      },
      receipt_email: user.email, // Stripe emails the customer a payment receipt
      metadata, // read back by the webhook
    });

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      amounts: { subtotal, shipping, tax, total },
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(500).json({ error: "Failed to create payment intent" });
  }
}

const restock = (reserved) =>
  Promise.all(reserved.map((item) => Product.updateOne({ _id: item.p }, { $inc: { stock: item.q } })));

export async function handleWebhook(req, res) {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, ENV.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    const { metadata } = paymentIntent;

    console.log("Payment succeeded:", paymentIntent.id);

    let reserved = [];

    try {
      // Check if order already exists (prevent duplicates)
      const existingOrder = await Order.findOne({ "paymentResult.id": paymentIntent.id });
      if (existingOrder) {
        console.log("Order already exists for payment:", paymentIntent.id);
        return res.json({ received: true });
      }

      // the cart only holds product id, quantity and price: look up the rest
      const items = JSON.parse(unpackMeta("items", metadata) || metadata.orderItems);
      const address = JSON.parse(unpackMeta("address", metadata) || metadata.shippingAddress);

      // Reserve the stock first, one conditional update per product (never below zero).
      // Two buyers racing for the last unit: only one update matches.
      let soldOut = null;
      for (const item of items) {
        const result = await Product.updateOne(
          { _id: item.p, stock: { $gte: item.q } },
          { $inc: { stock: -item.q } }
        );
        if (result.modifiedCount === 1) reserved.push(item);
        else {
          soldOut = item;
          break;
        }
      }

      if (soldOut) {
        // the customer has paid for something that sold out in the meantime: undo and refund in full
        await restock(reserved);
        await stripe.refunds.create(
          {
            payment_intent: paymentIntent.id,
            reason: "requested_by_customer",
            metadata: { why: "out_of_stock", product: soldOut.p },
          },
          { idempotencyKey: `refund-soldout-${paymentIntent.id}` }
        );
        console.warn(`Sold out during checkout, refunded ${paymentIntent.id} (product ${soldOut.p})`);
        return res.json({ received: true });
      }

      const products = await Product.find({ _id: { $in: items.map((item) => item.p) } });
      const productById = new Map(products.map((product) => [product._id.toString(), product]));
      const orderSubtotal = items.reduce((sum, item) => sum + item.pr * item.q, 0);
      const pricing = computePricing(orderSubtotal);

      const order = await Order.create({
        user: metadata.userId,
        clerkId: metadata.clerkId,
        orderItems: items.map((item) => {
          const product = productById.get(item.p);
          return {
            product: item.p,
            vendor: product?.vendor,
            name: product?.name || "Unavailable product",
            price: item.pr,
            quantity: item.q,
            image: product?.images?.[0] || "",
          };
        }),
        shippingAddress: address,
        paymentResult: {
          id: paymentIntent.id,
          status: "succeeded",
        },
        pricing: { subtotal: orderSubtotal, shipping: pricing.shipping, tax: pricing.tax },
        statusHistory: [{ status: "pending", note: "Order placed and paid", by: "customer" }],
        totalPrice: parseFloat(metadata.totalPrice),
      });

      console.log("Order created successfully:", order._id);
    } catch (error) {
      // the order was not created, so the reserved stock goes back
      await restock(reserved).catch((e) => console.error("Restock failed:", e.message));

      // a concurrent delivery of the same event already created the order
      if (error.code === 11000) return res.json({ received: true });

      console.error("Error creating order from webhook:", error);
      // non-2xx makes Stripe retry the event instead of losing a paid order
      return res.status(500).json({ error: "Failed to create order" });
    }
  }

  res.json({ received: true });
}
