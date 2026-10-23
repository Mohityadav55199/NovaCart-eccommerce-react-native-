import { Router } from "express";
import {
  cancelOrderAsStaff,
  createProduct,
  decideRefund,
  deleteProduct,
  getAllCustomers,
  getAllOrders,
  getAllProducts,
  getAuditLog,
  getDashboardStats,
  pauseVendor,
  reviewProduct,
  setUserRoles,
  updateOrderItem,
  updateOrderStatus,
  updateProduct,
} from "../controllers/admin.controller.js";
import { protectRoute, requirePermission, requireReverification } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/multer.middleware.js";

const router = Router();

// everything here needs a signed-in person; each route then asks for the permission it needs.
// Vendors hold the ":own" form of a permission, which the controllers turn into "only their own data".
router.use(protectRoute);

// the admin site asks this after sign-in: 200 with the role and permissions for anyone who may use it
router.get("/check", requirePermission("dashboard:view"), (req, res) =>
  res.status(200).json({ role: req.role, name: req.user.name, permissions: [...req.perms] })
);

router.get("/stats", requirePermission("dashboard:view"), getDashboardStats);

// products: admins manage all, vendors only their own (enforced in the controller)
router.post("/products", requirePermission("products:write"), upload.array("images", 3), createProduct);
router.get("/products", requirePermission("products:read"), getAllProducts);
router.put("/products/:id", requirePermission("products:write"), upload.array("images", 3), updateProduct);
router.delete("/products/:id", requirePermission("products:write"), deleteProduct);
router.post("/products/:id/review", requirePermission("products:review"), reviewProduct);

// orders: admin and support see all, vendors only the orders (and items) that are theirs
router.get("/orders", requirePermission("orders:view"), getAllOrders);
router.patch("/orders/:orderId/items/:itemId", requirePermission("orders:fulfil"), updateOrderItem);
router.patch("/orders/:orderId/status", requirePermission("orders:fulfil"), (req, res, next) =>
  req.scope("orders:fulfil") === "all" ? next() : res.status(403).json({ error: "Only admins can change a whole order at once" }),
  updateOrderStatus
);
// refunds: re-confirm identity (when enabled), then cancel; over the person's limit it waits for approval
router.post("/orders/:orderId/cancel", requirePermission("orders:refund"), requireReverification(), cancelOrderAsStaff);
router.post(
  "/orders/:orderId/refund-request/:decision",
  requirePermission("orders:refund:approve"),
  requireReverification(),
  decideRefund
);

// people: seeing them, and changing what they may do
router.get("/customers", requirePermission("customers:view"), getAllCustomers);
router.patch("/customers/:id/roles", requirePermission("customers:manage"), requireReverification(), setUserRoles);
router.patch("/customers/:id/pause", requirePermission("customers:manage"), pauseVendor);

router.get("/audit", requirePermission("audit:view"), getAuditLog);

export default router;
