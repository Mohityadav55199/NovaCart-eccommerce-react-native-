// shared by the Inngest sync and the protectRoute fallback so both build users the same way
export const buildUserDoc = ({ clerkId, email, firstName, lastName, imageUrl }) => ({
  clerkId,
  email,
  // accounts without a name (email sign-up) show their email name instead of a generic "User"
  name: [firstName, lastName].filter(Boolean).join(" ") || email?.split("@")[0] || "User",
  imageUrl: imageUrl || "",
  addresses: [],
  wishlist: [],
});
