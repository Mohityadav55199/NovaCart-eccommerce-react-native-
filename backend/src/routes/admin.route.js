import { Router } from "express";
import {
  cancelOrderAsAdmin,
  createProduct,
  deleteProduct,
  getAllCustomers,
  getAllOrders,
  getAllProducts,
  getDashboardStats,
  setUserRole,
  updateOrderItem,
  updateOrderStatus,
  updateProduct,
} from "../controllers/admin.controller.js";
import { adminOnly, protectRoute, staffOnly } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/multer.middleware.js";

const router = Router();

// everything here needs a signed-in admin or vendor; admin-only routes add adminOnly below
router.use(protectRoute, staffOnly);

// the admin site asks this before showing anything: 200 with the caller's role for admins and vendors
router.get("/check", (req, res) => res.status(200).json({ role: req.role, name: req.user.name }));

// products: admins manage all, vendors only their own (enforced in the controller)
router.post("/products", upload.array("images", 3), createProduct);
router.get("/products", getAllProducts);
router.put("/products/:id", upload.array("images", 3), updateProduct);
router.delete("/products/:id", deleteProduct);

// orders: admins see all, vendors only the orders (and items) that are theirs
router.get("/orders", getAllOrders);
router.patch("/orders/:orderId/items/:itemId", updateOrderItem); // status + tracking for one item
router.patch("/orders/:orderId/status", adminOnly, updateOrderStatus); // all items at once
router.post("/orders/:orderId/cancel", adminOnly, cancelOrderAsAdmin); // cancel + refund

router.get("/stats", getDashboardStats);

// customers and roles are admin-only
router.get("/customers", adminOnly, getAllCustomers);
router.patch("/customers/:id/role", adminOnly, setUserRole);

export default router;
