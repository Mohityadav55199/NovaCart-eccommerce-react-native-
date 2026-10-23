import { Router } from "express";
import { connectPayouts, getPayouts } from "../controllers/vendor.controller.js";
import { protectRoute, requirePermission } from "../middleware/auth.middleware.js";

const router = Router();

router.use(protectRoute);

// vendors: set up payouts and see earnings. Admins see the platform totals.
router.post("/connect", requirePermission("payouts:view"), connectPayouts);
router.get("/payouts", requirePermission("payouts:view"), getPayouts);

export default router;
