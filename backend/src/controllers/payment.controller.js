import { ENV } from "../config/env.js";
import { User } from "../models/user.model.js";
import { Product } from "../models/product.model.js";
import { Order } from "../models/order.model.js";
import { Cart } from "../models/cart.model.js";
import { stripe } from "../config/stripe.js";
import { computePricing } from "../config/pricing.js";


export async function createPaymentIntent(req, res) {
  try {
    const { cartItems, shippingAddress } = req.body;
    const user = req.user;

    // Validate cart items
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const requiredAddressFields = ["fullName", "streetAddress", "city", "state", "zipCode", "phoneNumber"];
    if (!shippingAddress || requiredAddressFields.some((field) => !shippingAddress[field])) {
      return res.status(400).json({ error: "A complete shipping address is required" });
    }

    // Calculate total from server-side (don't trust client - ever.)
    let subtotal = 0;
    const validatedItems = [];

    for (const item of cartItems) {
      const quantity = Number(item?.quantity);
      if (!item?.product?._id || !Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ error: "Invalid cart item" });
      }

      const product = await Product.findById(item.product._id);
      if (!product) {
        return res.status(404).json({ error: `Product ${item.product.name} not found` });
      }

      if (product.stock < quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
      }

      subtotal += product.price * quantity;
      // compact on purpose: Stripe metadata values are limited to 500 characters
      validatedItems.push({ p: product._id.toString(), q: quantity, pr: product.price });
    }

    const address = {};
    for (const field of requiredAddressFields) address[field] = String(shippingAddress[field]);
    const orderItemsMeta = JSON.stringify(validatedItems);
    const addressMeta = JSON.stringify(address);
    if (orderItemsMeta.length > 500 || addressMeta.length > 500) {
      return res.status(400).json({ error: "Too many items or address too long for one order" });
    }

    const { shipping, tax, total } = computePricing(subtotal);

    if (total <= 0) {
      return res.status(400).json({ error: "Invalid order total" });
    }

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
      metadata: {
        clerkId: user.clerkId,
        userId: user._id.toString(),
        orderItems: orderItemsMeta,
        shippingAddress: addressMeta,
        totalPrice: total.toFixed(2),
      },
      // in the webhooks section we will use this metadata
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

    console.log("Payment succeeded:", paymentIntent.id);

    try {
      const { userId, clerkId, orderItems, shippingAddress, totalPrice } = paymentIntent.metadata;

      // Check if order already exists (prevent duplicates)
      const existingOrder = await Order.findOne({ "paymentResult.id": paymentIntent.id });
      if (existingOrder) {
        console.log("Order already exists for payment:", paymentIntent.id);
        return res.json({ received: true });
      }

      // metadata only holds product id, quantity and price: look up the rest
      const items = JSON.parse(orderItems);
      const products = await Product.find({ _id: { $in: items.map((item) => item.p) } });
      const productById = new Map(products.map((product) => [product._id.toString(), product]));

      const orderSubtotal = items.reduce((sum, item) => sum + item.pr * item.q, 0);

      const order = await Order.create({
        user: userId,
        clerkId,
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
        shippingAddress: JSON.parse(shippingAddress),
        paymentResult: {
          id: paymentIntent.id,
          status: "succeeded",
        },
        pricing: {
          subtotal: orderSubtotal,
          shipping: computePricing(orderSubtotal).shipping,
          tax: computePricing(orderSubtotal).tax,
        },
        statusHistory: [{ status: "pending", note: "Order placed and paid", by: "customer" }],
        totalPrice: parseFloat(totalPrice),
      });

      // update product stock (never below zero)
      for (const item of items) {
        await Product.updateOne({ _id: item.p }, [
          { $set: { stock: { $max: [0, { $subtract: ["$stock", item.q] }] } } },
        ]);
      }

      console.log("Order created successfully:", order._id);
    } catch (error) {
      // a concurrent delivery of the same event already created the order
      if (error.code === 11000) return res.json({ received: true });

      console.error("Error creating order from webhook:", error);
      // non-2xx makes Stripe retry the event instead of losing a paid order
      return res.status(500).json({ error: "Failed to create order" });
    }
  }

  res.json({ received: true });
}
