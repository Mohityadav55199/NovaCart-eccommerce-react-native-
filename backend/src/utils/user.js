// shared by the Inngest sync and the protectRoute fallback so both build users the same way
export const buildUserDoc = ({ clerkId, email, firstName, lastName, imageUrl }) => ({
  clerkId,
  email,
  name: [firstName, lastName].filter(Boolean).join(" ") || "User",
  imageUrl: imageUrl || "",
  addresses: [],
  wishlist: [],
});
