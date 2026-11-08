import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { createReview, deleteReview } from "../controllers/review.controller.js";

const router = Router();

router.post("/", protectRoute, createReview);
// a customer can remove their own review (not used by the mobile app yet)
router.delete("/:reviewId", protectRoute, deleteReview);

export default router;
