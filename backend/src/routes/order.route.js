import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getUserOrders } from "../controllers/order.controller.js";

const router = Router();

router.get("/", protectRoute, getUserOrders);

export default router;
