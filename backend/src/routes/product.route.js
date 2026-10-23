import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getProductById, getShopProducts } from "../controllers/product.controller.js";

const router = Router();

router.get("/", protectRoute, getShopProducts);
router.get("/:id", protectRoute, getProductById);

export default router;
