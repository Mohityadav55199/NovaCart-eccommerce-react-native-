import { clerkClient } from "@clerk/express";
import { reverificationError } from "@clerk/shared/authorization-errors";
import { User } from "../models/user.model.js";
import { ENV } from "../config/env.js";
import { REQUIRE_REVERIFICATION } from "../config/limits.js";
import { permissionsFor, scopeOf } from "../config/permissions.js";
import { buildUserDoc } from "../utils/user.js";

const EMAIL_RECHECK_MS = 10 * 60 * 1000;

const primaryEmailOf = (clerkUser) => clerkUser.primaryEmailAddress || clerkUser.emailAddresses[0];

// creates the db user from the Clerk profile when the Clerk webhook hasn't run (or is down)
const createUserFromClerk = async (clerkId) => {
  const clerkUser = await clerkClient.users.getUser(clerkId);
  const primary = primaryEmailOf(clerkUser);
  const email = primary?.emailAddress;
  if (!email) return null;

  try {
    return await User.create({
      ...buildUserDoc({
        clerkId,
        email,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
      }),
      emailVerified: primary.verification?.status === "verified",
      emailCheckedAt: new Date(),
    });
  } catch (error) {
    // concurrent first requests (or the webhook) already created it
    if (error.code === 11000 && error.keyPattern?.clerkId) return User.findOne({ clerkId });
    // the same email under an older Clerk account (deleted and re-created): Clerk verified the email,
    // so the existing record moves to the new Clerk id and keeps its orders and roles
    // (an unverified email proves nothing: it must never hand over someone else's record)
    if (error.code === 11000 && error.keyPattern?.email && primary.verification?.status === "verified") {
      return User.findOneAndUpdate({ email }, { clerkId, emailVerified: true, emailCheckedAt: new Date() }, { new: true });
    }
    throw error;
  }
};

// Admin access is decided by the stored email, so that email must be Clerk's current VERIFIED primary email.
// Re-read it from Clerk every few minutes (and not more than once a minute after a failure).
const lastAttempt = new Map();
async function refreshEmailFromClerk(user) {
  const now = Date.now();
  if (now - (lastAttempt.get(user.clerkId) || 0) < 60 * 1000) return user;
  if (lastAttempt.size > 5000) lastAttempt.clear(); // keep the map from growing for the life of the process
  lastAttempt.set(user.clerkId, now);

  const before = { email: user.email, emailVerified: user.emailVerified, imageUrl: user.imageUrl };

  try {
    const clerkUser = await clerkClient.users.getUser(user.clerkId);
    const primary = primaryEmailOf(clerkUser);
    if (!primary) return user;

    user.emailVerified = primary.verification?.status === "verified";
    user.emailCheckedAt = new Date();
    if (primary.emailAddress !== user.email) user.email = primary.emailAddress;
    if (clerkUser.imageUrl && clerkUser.imageUrl !== user.imageUrl) user.imageUrl = clerkUser.imageUrl;
    await user.save();
  } catch (error) {
    // email already used by another record, or Clerk unreachable: keep what is stored
    console.error("Could not refresh the email from Clerk:", error.message);
    Object.assign(user, before);
  }
  return user;
}

// the configured admin emails (read on each call, so tests and config changes are picked up)
export const adminEmailList = () =>
  (process.env.ADMIN_EMAIL ?? ENV.ADMIN_EMAIL ?? "")
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

      let user = (await User.findOne({ clerkId })) || (await createUserFromClerk(clerkId));
      if (!user) return res.status(404).json({ message: "User not found" });

      if (!user.emailCheckedAt) {
        user = await refreshEmailFromClerk(user); // never checked: wait for the first answer
      } else if (Date.now() - user.emailCheckedAt.getTime() > EMAIL_RECHECK_MS) {
        // checked before: refresh in the background so this request is not slowed down
        refreshEmailFromClerk(user).catch((error) => console.error("email refresh:", error.message));
      }

      req.user = user;

      next();
    } catch (error) {
      console.error("Error in protectRoute middleware", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
];

/* ---------------------------------------------------------------------------- roles and permissions */

// "admin" comes only from ADMIN_EMAIL and only while that email is verified in Clerk (remove an email there and
// its access ends immediately). "vendor", "support" and "customer" are stored on the user; a person can hold several.
export const isAdminEmail = (email) => adminEmailList().includes((email || "").toLowerCase());

export const getRoles = (user) => {
  const roles = new Set(["customer", ...(user.roles || [])]);
  if (isAdminEmail(user.email) && user.emailVerified !== false) roles.add("admin");
  return [...roles];
};

// the highest role decides what the admin site shows: admin > support > vendor > customer
export const getRole = (user) => {
  const roles = getRoles(user);
  for (const role of ["admin", "support", "vendor"]) if (roles.includes(role)) return role;
  return "customer";
};

export const getPermissions = (user) => permissionsFor(getRoles(user));

// A route asks for a permission (any one of those listed, whole or ":own"). The request then carries
// req.role, req.perms and req.scope("orders:view") -> "all" | "own" for the controller to filter with.
export const requirePermission =
  (...needed) =>
  (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized - user not found" });

    req.role = getRole(req.user);
    req.perms = getPermissions(req.user);
    req.scope = (permission) => scopeOf(req.perms, permission);

    // A guard rail, not authentication: the admin site tells us which view the request comes from, and a request
    // from the customer view is refused staff powers (stops mix-ups such as acting in the wrong tab). Real access
    // control is the signed-in person's permissions below, which a client cannot change.
    if (req.headers["x-active-mode"] === "customer") {
      return res.status(403).json({
        message: "You are in the customer view. Switch to your seller view to do this.",
        code: "WRONG_MODE",
      });
    }

    if (!needed.some((permission) => req.scope(permission))) {
      return res.status(403).json({ message: `Forbidden - missing permission: ${needed.join(" or ")}` });
    }

    next();
  };

// Clerk re-verification: before a refund or a role change the person must have confirmed their identity recently.
// The admin site answers the 403 below by showing Clerk's confirm dialog and retrying. Off until REQUIRE_REVERIFICATION=true.
export const requireReverification =
  (level = "moderate") =>
  (req, res, next) => {
    if (!REQUIRE_REVERIFICATION) return next();
    if (req.auth?.()?.has?.({ reverification: level })) return next();
    return res.status(403).json(reverificationError(level));
  };
