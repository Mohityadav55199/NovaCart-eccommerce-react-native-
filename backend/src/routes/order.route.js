import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { cancelMyOrder, getOrderById, getUserOrders } from "../controllers/order.controller.js";

const router = Router();

router.get("/", protectRoute, getUserOrders);
router.get("/:id", protectRoute, getOrderById);
router.post("/:id/cancel", protectRoute, cancelMyOrder);

export default router;
