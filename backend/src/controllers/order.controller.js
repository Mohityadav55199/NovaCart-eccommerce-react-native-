import mongoose from "mongoose";
import { Order } from "../models/order.model.js";
import { Review } from "../models/review.model.js";
import { cancelOrder, respondWithError } from "../services/order.service.js";

// a customer can only be shown (and cancel) their own orders
const findOwnOrder = (req) =>
  Order.findOne({ _id: req.params.id, clerkId: req.user.clerkId }).populate("orderItems.product");

export async function getUserOrders(req, res) {
  try {
    const orders = await Order.find({ clerkId: req.user.clerkId })
      .populate("orderItems.product")
      .sort({ createdAt: -1 });

    // check if each order has been reviewed
    const orderIds = orders.map((order) => order._id);
    const reviews = await Review.find({ orderId: { $in: orderIds } });
    const reviewedOrderIds = new Set(reviews.map((review) => review.orderId.toString()));

    const ordersWithReviewStatus = orders.map((order) => ({
      ...order.toObject(),
      hasReviewed: reviewedOrderIds.has(order._id.toString()),
    }));

    res.status(200).json({ orders: ordersWithReviewStatus });
  } catch (error) {
    respondWithError(res, error, "getUserOrders");
  }
}

export async function getOrderById(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = await findOwnOrder(req);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const review = await Review.exists({ orderId: order._id });

    res.status(200).json({ order: { ...order.toObject(), hasReviewed: !!review } });
  } catch (error) {
    respondWithError(res, error, "getOrderById");
  }
}

export async function cancelMyOrder(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: "Order not found" });
    }

    // ownership check first: cancelOrder itself works on any order id
    const own = await Order.exists({ _id: req.params.id, clerkId: req.user.clerkId });
    if (!own) return res.status(404).json({ error: "Order not found" });

    const reason = String(req.body?.reason || "").trim().slice(0, 200);
    await cancelOrder(req.params.id, { reason, by: "customer" });

    const order = await findOwnOrder(req);
    res.status(200).json({ message: "Order cancelled and refunded", order: order.toObject() });
  } catch (error) {
    respondWithError(res, error, "cancelMyOrder");
  }
}
