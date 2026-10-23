import fs from "node:fs/promises";
import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.js";
import { Product } from "../models/product.model.js";
import { Order } from "../models/order.model.js";
import { User } from "../models/user.model.js";
import { getRole } from "../middleware/auth.middleware.js";
import {
  OrderError,
  cancelOrder,
  respondWithError,
  setAllItemsStatus,
  updateItemFulfilment,
} from "../services/order.service.js";

// req.role / req.user are set by protectRoute + requireRole ("admin" sees everything, "vendor" only their own)
const isVendor = (req) => req.role === "vendor";
const canManageProduct = (req, product) =>
  req.role === "admin" || (product.vendor && product.vendor.equals(req.user._id));

// multer writes uploads to the OS temp dir; remove them once Cloudinary has them
async function removeTempFiles(files = []) {
  await Promise.all(files.map((file) => fs.unlink(file.path).catch(() => {})));
}

/* ----------------------------------------------------------------------------- products */

export async function createProduct(req, res) {
  try {
    const { name, description, price, stock, category } = req.body;

    if (!name || !description || !category || price === undefined || stock === undefined) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const parsedPrice = parseFloat(price);
    const parsedStock = Number(stock);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0 || !Number.isInteger(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ message: "Price and stock must be valid non-negative numbers" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "At least one image is required" });
    }

    if (req.files.length > 3) {
      return res.status(400).json({ message: "Maximum 3 images allowed" });
    }

    const uploadPromises = req.files.map((file) => {
      return cloudinary.uploader.upload(file.path, {
        folder: "products",
      });
    });

    const uploadResults = await Promise.all(uploadPromises);

    const imageUrls = uploadResults.map((result) => result.secure_url);

    const product = await Product.create({
      name,
      description,
      price: parsedPrice,
      stock: parsedStock,
      category,
      images: imageUrls,
      // a vendor's products belong to them; the owner's own products are store-owned
      vendor: isVendor(req) ? req.user._id : undefined,
    });

    res.status(201).json(product);
  } catch (error) {
    console.error("Error creating product", error);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    await removeTempFiles(req.files);
  }
}

export async function getAllProducts(req, res) {
  try {
    const filter = isVendor(req) ? { vendor: req.user._id } : {};
    // -1 means in desc order: most recent products first
    const products = await Product.find(filter).populate("vendor", "name").sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const { name, description, price, stock, category } = req.body;

    const product = await Product.findById(id);
    // a vendor asking for someone else's product gets the same answer as for a missing one
    if (!product || !canManageProduct(req, product)) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (name) product.name = name;
    if (description) product.description = description;
    if (price !== undefined) {
      const parsedPrice = parseFloat(price);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: "Invalid price" });
      }
      product.price = parsedPrice;
    }
    if (stock !== undefined) {
      const parsedStock = Number(stock);
      if (!Number.isInteger(parsedStock) || parsedStock < 0) {
        return res.status(400).json({ message: "Invalid stock" });
      }
      product.stock = parsedStock;
    }
    if (category) product.category = category;

    // handle image updates if new images are uploaded
    if (req.files && req.files.length > 0) {
      if (req.files.length > 3) {
        return res.status(400).json({ message: "Maximum 3 images allowed" });
      }

      const uploadPromises = req.files.map((file) => {
        return cloudinary.uploader.upload(file.path, {
          folder: "products",
        });
      });

      const uploadResults = await Promise.all(uploadPromises);
      product.images = uploadResults.map((result) => result.secure_url);
    }

    await product.save();
    res.status(200).json(product);
  } catch (error) {
    console.error("Error updating products:", error);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    await removeTempFiles(req.files);
  }
}

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product || !canManageProduct(req, product)) {
      return res.status(404).json({ message: "Product not found" });
    }

    await Product.findByIdAndDelete(id);

    // Delete our uploaded images from Cloudinary (seeded/external image URLs are skipped).
    // This runs after the DB delete, so a Cloudinary failure can't leave the product undeletable.
    const publicIds = (product.images || [])
      .map((imageUrl) => imageUrl.split("/products/")[1]?.replace(/\.[^./]+$/, ""))
      .filter(Boolean)
      .map((name) => `products/${name}`);
    await Promise.allSettled(publicIds.map((publicId) => cloudinary.uploader.destroy(publicId)));

    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ message: "Failed to delete product" });
  }
};

/* ------------------------------------------------------------------------------ orders */

export async function getAllOrders(req, res) {
  try {
    const filter = isVendor(req) ? { "orderItems.vendor": req.user._id } : {};

    const orders = await Order.find(filter)
      .populate("user", "name email")
      .populate("orderItems.product")
      .sort({ createdAt: -1 });

    if (!isVendor(req)) return res.status(200).json({ orders });

    // a vendor sees only their own items of an order, and no customer email
    const mine = orders.map((order) => {
      const plain = order.toObject();
      plain.orderItems = plain.orderItems.filter(
        (item) => item.vendor && item.vendor.toString() === req.user._id.toString()
      );
      plain.user = { _id: plain.user?._id, name: plain.user?.name };
      plain.myTotal = plain.orderItems
        .filter((item) => item.status !== "cancelled")
        .reduce((sum, item) => sum + item.price * item.quantity, 0);
      return plain;
    });

    res.status(200).json({ orders: mine });
  } catch (error) {
    respondWithError(res, error, "getAllOrders");
  }
}

// admin: set the status of every active item of an order at once
export async function updateOrderStatus(req, res) {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!["pending", "shipped", "delivered"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (order.status === "cancelled") {
      return res.status(400).json({ error: "This order was cancelled" });
    }

    setAllItemsStatus(order, status, "admin");
    await order.save();

    res.status(200).json({ message: "Order status updated successfully", order });
  } catch (error) {
    respondWithError(res, error, "updateOrderStatus");
  }
}

// admin or the item's vendor: status, carrier and tracking number of one item
export async function updateOrderItem(req, res) {
  try {
    const { orderId, itemId } = req.params;
    const { status, carrier, trackingNumber } = req.body;

    if (!mongoose.isValidObjectId(orderId) || !mongoose.isValidObjectId(itemId)) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (status !== undefined && !["pending", "shipped", "delivered"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const updated = await updateItemFulfilment(
      order,
      itemId,
      { status, carrier, trackingNumber },
      { user: req.user, role: req.role }
    );

    res.status(200).json({ message: "Item updated", order: updated });
  } catch (error) {
    respondWithError(res, error, "updateOrderItem");
  }
}

// admin only: cancel any order that has not shipped and refund the customer
export async function cancelOrderAsAdmin(req, res) {
  try {
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) throw new OrderError(404, "Order not found");

    const reason = String(req.body?.reason || "").trim().slice(0, 200);
    const order = await cancelOrder(orderId, { reason, by: "admin" });

    res.status(200).json({ message: "Order cancelled and refunded", order });
  } catch (error) {
    respondWithError(res, error, "cancelOrderAsAdmin");
  }
}

/* --------------------------------------------------------------------------- customers */

export async function getAllCustomers(_, res) {
  try {
    const users = await User.find().sort({ createdAt: -1 }); // latest user first
    const customers = users.map((user) => ({ ...user.toObject(), role: getRole(user) }));
    res.status(200).json({ customers });
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// admin only: make someone a vendor (or back to a plain customer)
export async function setUserRole(req, res) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!["customer", "vendor"].includes(role)) {
      return res.status(400).json({ error: "Role must be customer or vendor" });
    }
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: "User not found" });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (getRole(user) === "admin") {
      return res.status(400).json({ error: "Admins are managed through ADMIN_EMAIL, not here" });
    }

    user.role = role;
    await user.save();

    res.status(200).json({ message: `${user.name} is now a ${role}`, user: { ...user.toObject(), role } });
  } catch (error) {
    console.error("Error in setUserRole:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/* ------------------------------------------------------------------------------- stats */

export async function getDashboardStats(req, res) {
  try {
    if (isVendor(req)) {
      const vendorId = req.user._id;

      const [products, revenueResult, orderIds] = await Promise.all([
        Product.countDocuments({ vendor: vendorId }),
        Order.aggregate([
          { $unwind: "$orderItems" },
          { $match: { "orderItems.vendor": vendorId, "orderItems.status": { $ne: "cancelled" } } },
          { $group: { _id: null, total: { $sum: { $multiply: ["$orderItems.price", "$orderItems.quantity"] } } } },
        ]),
        Order.distinct("_id", { orderItems: { $elemMatch: { vendor: vendorId, status: { $ne: "cancelled" } } } }),
      ]);

      return res.status(200).json({
        totalRevenue: revenueResult[0]?.total || 0,
        totalOrders: orderIds.length,
        totalCustomers: null, // customer data is admin-only
        totalProducts: products,
      });
    }

    // cancelled (refunded) orders are not revenue
    const [totalOrders, revenueResult, totalCustomers, totalProducts] = await Promise.all([
      Order.countDocuments({ status: { $ne: "cancelled" } }),
      Order.aggregate([
        { $match: { status: { $ne: "cancelled" } } },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),
      User.countDocuments(),
      Product.countDocuments(),
    ]);

    res.status(200).json({
      totalRevenue: revenueResult[0]?.total || 0,
      totalOrders,
      totalCustomers,
      totalProducts,
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
