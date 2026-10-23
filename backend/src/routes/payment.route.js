import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { checkoutLimiter } from "../middleware/security.middleware.js";
import { createPaymentIntent, handleWebhook } from "../controllers/payment.controller.js";

const router = Router();

router.post("/create-intent", checkoutLimiter, protectRoute, createPaymentIntent);

// No auth needed - Stripe validates via signature
router.post("/webhook", handleWebhook);

export default router;
