import fs from "node:fs/promises";
import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.js";
import { TRUSTED_AFTER_APPROVED } from "../config/limits.js";
import { Product } from "../models/product.model.js";
import { Order } from "../models/order.model.js";
import { User } from "../models/user.model.js";
import { AuditLog } from "../models/auditLog.model.js";
import { getRole, getRoles } from "../middleware/auth.middleware.js";
import { audit } from "../services/audit.service.js";
import { setVendorProductsHidden } from "../services/vendor.service.js";
import {
  OrderError,
  cancelAsStaff,
  decideRefundRequest,
  respondWithError,
  setAllItemsStatus,
  updateItemFulfilment,
} from "../services/order.service.js";

// Every route is guarded by requirePermission, which puts req.scope("x:y") on the request:
//   "all" = the permission covers everything, "own" = only the person's own data (a vendor's).
const ownsProduct = (req, product) => !!product.vendor && product.vendor.equals(req.user._id);
const canManageProduct = (req, product, permission) => {
  const scope = req.scope(permission);
  return scope === "all" || (scope === "own" && ownsProduct(req, product));
};

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

    // vendors sell under their own name; the store's own products have no vendor
    const isSellerScope = req.scope("products:write") === "own";
    let status = "approved";
    if (isSellerScope) {
      if (req.user.vendorProfile?.paused) {
        return res.status(403).json({ message: "Selling is paused for your store. Contact the store owner." });
      }
      // a vendor's first products are reviewed by an admin; after enough approved ones they are trusted
      const approved = await Product.countDocuments({ vendor: req.user._id, status: { $in: ["approved", "paused"] } });
      status = approved >= TRUSTED_AFTER_APPROVED ? "approved" : "pending";
    }

    const uploadResults = await Promise.all(
      req.files.map((file) => cloudinary.uploader.upload(file.path, { folder: "products" }))
    );
    const imageUrls = uploadResults.map((result) => result.secure_url);

    const product = await Product.create({
      name,
      description,
      price: parsedPrice,
      stock: parsedStock,
      category,
      images: imageUrls,
      vendor: isSellerScope ? req.user._id : undefined,
      status,
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
    const filter = req.scope("products:read") === "own" ? { vendor: req.user._id } : {};
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

    const product = mongoose.isValidObjectId(id) ? await Product.findById(id) : null;
    // a vendor asking for someone else's product gets the same answer as for a missing one
    if (!product || !canManageProduct(req, product, "products:write")) {
      return res.status(404).json({ message: "Product not found" });
    }

    const contentBefore = JSON.stringify([product.name, product.description, product.category, product.images]);

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

      const uploadResults = await Promise.all(
        req.files.map((file) => cloudinary.uploader.upload(file.path, { folder: "products" }))
      );
      product.images = uploadResults.map((result) => result.secure_url);
    }

    if (req.scope("products:write") === "own") {
      const contentChanged = JSON.stringify([product.name, product.description, product.category, product.images]) !== contentBefore;
      if (product.status === "rejected") {
        product.status = "pending"; // a fixed product goes back for review
      } else if (contentChanged && product.status === "approved") {
        // a vendor who is not trusted yet cannot swap an approved product for something else: it is reviewed again
        const approved = await Product.countDocuments({ vendor: req.user._id, status: { $in: ["approved", "paused"] } });
        if (approved < TRUSTED_AFTER_APPROVED) product.status = "pending";
      }
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

    const product = mongoose.isValidObjectId(id) ? await Product.findById(id) : null;
    if (!product || !canManageProduct(req, product, "products:write")) {
      return res.status(404).json({ message: "Product not found" });
    }

    await Product.findByIdAndDelete(id);
    if (!ownsProduct(req, product)) await audit(req, "product.delete", { type: "product", id, label: product.name });

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

// approve or reject a vendor's product
export async function reviewProduct(req, res) {
  try {
    const { id } = req.params;
    const { decision } = req.body;
    const note = String(req.body.note || "").trim().slice(0, 300);

    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({ message: "Decision must be approve or reject" });
    }
    const product = mongoose.isValidObjectId(id) ? await Product.findById(id).populate("vendor", "vendorProfile roles") : null;
    if (!product) return res.status(404).json({ message: "Product not found" });

    // a product whose vendor was paused, removed or deleted stays off sale even when approved
    const vendor = product.vendor;
    const vendorCanSell = !product.vendor || (vendor?.roles?.includes("vendor") && !vendor.vendorProfile?.paused && !vendor.vendorProfile?.suspended);
    product.status = decision === "reject" ? "rejected" : vendorCanSell ? "approved" : "paused";
    product.reviewNote = decision === "reject" ? note : "";
    await product.save();

    await audit(req, `product.${decision}`, { type: "product", id, label: product.name }, { note });
    res.status(200).json(product);
  } catch (error) {
    console.error("Error reviewing product:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

/* ------------------------------------------------------------------------------ orders */

export async function getAllOrders(req, res) {
  try {
    const viewScope = req.scope("orders:view");
    const filter = viewScope === "own" ? { "orderItems.vendor": req.user._id } : {};
    // ?limit=5 is used by the dashboard so it doesn't download every order
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 0, 0), 200);
    const canSeeCustomers = req.scope("customers:view") === "all";

    let query = Order.find(filter)
      .populate("user", canSeeCustomers ? "name email" : "name")
      .populate("orderItems.product")
      .sort({ createdAt: -1 });
    if (limit) query = query.limit(limit);
    const orders = await query;

    if (viewScope === "all") return res.status(200).json({ orders });

    // A vendor gets an explicit whitelist: only their own items and what they need to ship them.
    // No payment ids, refund details, other vendors' items or totals, and no customer email.
    const mine = orders.map((order) => {
      const plain = order.toObject();
      const items = plain.orderItems.filter(
        (item) => item.vendor && item.vendor.toString() === req.user._id.toString()
      );
      const myItemIds = new Set(items.map((item) => item._id.toString()));

      return {
        _id: plain._id,
        createdAt: plain.createdAt,
        updatedAt: plain.updatedAt,
        status: plain.status,
        shippingAddress: plain.shippingAddress,
        user: { _id: plain.user?._id, name: plain.user?.name },
        orderItems: items,
        myTotal: items
          .filter((item) => item.status !== "cancelled")
          .reduce((sum, item) => sum + item.price * item.quantity, 0),
        // events about other vendors' items are left out
        statusHistory: (plain.statusHistory || []).filter(
          (event) => !event.item || myItemIds.has(event.item.toString())
        ),
        cancellation: plain.cancellation
          ? { by: plain.cancellation.by, at: plain.cancellation.at, reason: plain.cancellation.reason }
          : undefined,
      };
    });

    res.status(200).json({ orders: mine });
  } catch (error) {
    respondWithError(res, error, "getAllOrders");
  }
}

// set the status of every active item of an order at once (needs the power to fulfil everyone's orders)
export async function updateOrderStatus(req, res) {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!["pending", "shipped", "delivered"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    if (!mongoose.isValidObjectId(orderId)) return res.status(404).json({ error: "Order not found" });

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (order.status === "cancelled") {
      return res.status(400).json({ error: "This order was cancelled" });
    }

    const { order: updated, changed } = await setAllItemsStatus(orderId, status, req.role);
    if (!changed) {
      return res.status(200).json({ message: "Nothing to change: the items already have that status or were already paid out", order: updated });
    }
    await audit(req, "order.status", { type: "order", id: orderId }, { status });

    res.status(200).json({ message: "Order status updated successfully", order: updated });
  } catch (error) {
    respondWithError(res, error, "updateOrderStatus");
  }
}

// status, carrier and tracking number of one item: everyone's items, or only your own
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
      { user: req.user, role: req.role, scope: req.scope("orders:fulfil") }
    );

    if (req.scope("orders:fulfil") === "all" && status) {
      await audit(req, "order.item.status", { type: "order", id: orderId }, { itemId, status });
    }
    res.status(200).json({ message: "Item updated", order: updated });
  } catch (error) {
    respondWithError(res, error, "updateOrderItem");
  }
}

// cancel an unshipped order and refund the customer; over the person's limit it waits for approval
export async function cancelOrderAsStaff(req, res) {
  try {
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) throw new OrderError(404, "Order not found");

    const reason = String(req.body?.reason || "").trim().slice(0, 200);
    const result = await cancelAsStaff(orderId, { reason, actor: { user: req.user, role: req.role } });

    await audit(
      req,
      result.done ? "order.refund" : "order.refund.request",
      { type: "order", id: orderId },
      { amount: result.order.totalPrice, reason }
    );

    if (!result.done) {
      return res.status(202).json({
        message: "This refund is over your limit. It is waiting for an admin to approve it.",
        pending: true,
        order: result.order,
      });
    }
    res.status(200).json({ message: "Order cancelled and refunded", order: result.order });
  } catch (error) {
    respondWithError(res, error, "cancelOrderAsStaff");
  }
}

// an admin approves or rejects a refund that was over someone's limit
export async function decideRefund(req, res) {
  try {
    const { orderId, decision } = req.params;
    if (!["approve", "reject"].includes(decision)) throw new OrderError(400, "Decision must be approve or reject");
    if (!mongoose.isValidObjectId(orderId)) throw new OrderError(404, "Order not found");

    const note = String(req.body?.note || "").trim().slice(0, 200);
    const order = await decideRefundRequest(orderId, decision, { actor: { user: req.user, role: req.role }, note });

    await audit(req, `order.refund.${decision}`, { type: "order", id: orderId }, { amount: order.totalPrice, note });
    res.status(200).json({ message: decision === "approve" ? "Refund approved" : "Refund rejected", order });
  } catch (error) {
    respondWithError(res, error, "decideRefund");
  }
}

/* --------------------------------------------------------------------------- customers */

export async function getAllCustomers(_, res) {
  try {
    const users = await User.find().sort({ createdAt: -1 }); // latest user first
    // an explicit whitelist: no Stripe ids, no clerk ids, no addresses or phone numbers
    const customers = users.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      imageUrl: user.imageUrl,
      createdAt: user.createdAt,
      role: getRole(user),
      roles: getRoles(user),
      addressCount: user.addresses?.length || 0,
      vendorProfile: user.roles.includes("vendor")
        ? { storeName: user.vendorProfile?.storeName, paused: !!user.vendorProfile?.paused, suspended: !!user.vendorProfile?.suspended }
        : undefined,
    }));
    res.status(200).json({ customers });
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// admin: turn the vendor and support roles on or off for someone. { vendor?: boolean, support?: boolean }
export async function setUserRoles(req, res) {
  try {
    const { id } = req.params;
    const { vendor, support } = req.body;

    if (typeof vendor !== "boolean" && typeof support !== "boolean") {
      return res.status(400).json({ error: "Send vendor and/or support as true or false" });
    }
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: "User not found" });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (getRoles(user).includes("admin")) {
      return res.status(400).json({ error: "Admins are managed through ADMIN_EMAIL, not here" });
    }

    const before = [...user.roles];
    const roles = new Set(user.roles);

    if (typeof vendor === "boolean") {
      const profile = user.vendorProfile || {};
      if (vendor) {
        roles.add("vendor");
        // lifting the removal also lifts the sales hold; a separate pause stays until it is lifted
        user.vendorProfile = {
          storeName: profile.storeName || user.name,
          since: profile.since || new Date(),
          suspended: false,
          paused: !!profile.paused,
          stripeAccountId: profile.stripeAccountId || "",
        };
      } else {
        roles.delete("vendor");
        // removed: they cannot become a vendor again by themselves, and nothing of theirs stays on sale
        user.vendorProfile = {
          storeName: profile.storeName,
          since: profile.since,
          suspended: true,
          paused: !!profile.paused,
          stripeAccountId: profile.stripeAccountId || "",
        };
      }
    }
    if (typeof support === "boolean") {
      if (support) roles.add("support");
      else roles.delete("support");
    }

    user.roles = [...roles];
    await user.save();

    if (typeof vendor === "boolean") await setVendorProductsHidden(user._id, !vendor || !!user.vendorProfile?.paused);

    await audit(req, "user.roles", { type: "user", id, label: user.email }, { before, after: user.roles });
    res.status(200).json({
      message: `Updated ${user.name}`,
      user: { ...user.toObject(), role: getRole(user), roles: getRoles(user) },
    });
  } catch (error) {
    console.error("Error in setUserRoles:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// admin: pause or resume a vendor's selling (products hidden, no new products; open orders can still be shipped)
export async function pauseVendor(req, res) {
  try {
    const { id } = req.params;
    const { paused } = req.body;

    if (typeof paused !== "boolean") return res.status(400).json({ error: "Send paused as true or false" });
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: "User not found" });

    const user = await User.findById(id);
    if (!user || !user.roles.includes("vendor")) return res.status(404).json({ error: "Vendor not found" });

    user.set("vendorProfile.paused", paused);
    await user.save();
    await setVendorProductsHidden(user._id, paused);

    await audit(req, paused ? "vendor.pause" : "vendor.resume", { type: "user", id, label: user.email });
    res.status(200).json({ message: paused ? "Selling paused" : "Selling resumed", user: user.toObject() });
  } catch (error) {
    console.error("Error in pauseVendor:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/* ------------------------------------------------------------------------------- stats */

export async function getDashboardStats(req, res) {
  try {
    const statsScope = req.scope("dashboard:view");

    if (statsScope === "own") {
      const vendorId = req.user._id;

      const [products, revenueResult, orderIds, pendingProducts] = await Promise.all([
        Product.countDocuments({ vendor: vendorId }),
        Order.aggregate([
          { $unwind: "$orderItems" },
          { $match: { "orderItems.vendor": vendorId, "orderItems.status": { $ne: "cancelled" } } },
          { $group: { _id: null, total: { $sum: { $multiply: ["$orderItems.price", "$orderItems.quantity"] } } } },
        ]),
        Order.distinct("_id", { orderItems: { $elemMatch: { vendor: vendorId, status: { $ne: "cancelled" } } } }),
        Product.countDocuments({ vendor: vendorId, status: "pending" }),
      ]);

      return res.status(200).json({
        totalRevenue: revenueResult[0]?.total || 0,
        totalOrders: orderIds.length,
        totalCustomers: null, // customer data is not for vendors
        totalProducts: products,
        pendingProducts,
      });
    }

    // cancelled (refunded) orders are not revenue
    const canReview = req.scope("products:review") === "all";
    const canApprove = req.scope("orders:refund:approve") === "all";

    const [totalOrders, revenueResult, totalCustomers, totalProducts, pendingProducts, pendingRefunds] = await Promise.all([
      Order.countDocuments({ status: { $ne: "cancelled" } }),
      Order.aggregate([
        { $match: { status: { $ne: "cancelled" } } },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),
      req.scope("customers:view") === "all" ? User.countDocuments() : null,
      Product.countDocuments(),
      canReview ? Product.countDocuments({ status: "pending" }) : null,
      canApprove ? Order.countDocuments({ "refundRequest.status": "pending", status: "pending" }) : null,
    ]);

    res.status(200).json({
      totalRevenue: revenueResult[0]?.total || 0,
      totalOrders,
      totalCustomers,
      totalProducts,
      pendingProducts,
      pendingRefunds,
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/* -------------------------------------------------------------------------------- audit */

export async function getAuditLog(req, res) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 300);
    const filter = {};
    if (req.query.action) filter.action = new RegExp(`^${String(req.query.action).replace(/[^a-z.]/gi, "")}`);
    if (req.query.before && !Number.isNaN(Date.parse(req.query.before))) filter.at = { $lt: new Date(req.query.before) };

    const entries = await AuditLog.find(filter).sort({ at: -1 }).limit(limit);
    res.status(200).json({ entries });
  } catch (error) {
    console.error("Error fetching audit log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
