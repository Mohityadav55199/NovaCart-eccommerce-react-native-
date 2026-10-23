import { clerkClient } from "@clerk/express";
import { User } from "../models/user.model.js";
import { ENV } from "../config/env.js";
import { buildUserDoc } from "../utils/user.js";

// creates the db user from the Clerk profile when the Inngest sync hasn't run (or is down)
const createUserFromClerk = async (clerkId) => {
  const clerkUser = await clerkClient.users.getUser(clerkId);
  const email = (clerkUser.primaryEmailAddress || clerkUser.emailAddresses[0])?.emailAddress;
  if (!email) return null;

  try {
    return await User.create(
      buildUserDoc({
        clerkId,
        email,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
      })
    );
  } catch (error) {
    // concurrent first requests (or the Inngest sync) already created it
    if (error.code === 11000 && error.keyPattern?.clerkId) return User.findOne({ clerkId });
    throw error;
  }
};

const adminEmails = (ENV.ADMIN_EMAIL || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

// an API must answer 401 JSON; Clerk's requireAuth() redirects to "/" which a SPA can't make sense of
const requireSignIn = (req, res, next) => {
  if (!req.auth?.()?.userId) return res.status(401).json({ message: "Unauthorized - please sign in" });
  next();
};

export const protectRoute = [
  requireSignIn,
  async (req, res, next) => {
    try {
      const clerkId = req.auth().userId;
      if (!clerkId) return res.status(401).json({ message: "Unauthorized - invalid token" });

      const user = (await User.findOne({ clerkId })) || (await createUserFromClerk(clerkId));
      if (!user) return res.status(404).json({ message: "User not found" });

      req.user = user;

      next();
    } catch (error) {
      console.error("Error in protectRoute middleware", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
];

export const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized - user not found" });
  }

  if (!adminEmails.includes(req.user.email.toLowerCase())) {
    return res.status(403).json({ message: "Forbidden - admin access only" });
  }

  next();
};
