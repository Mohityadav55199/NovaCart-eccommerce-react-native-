import { useReverification } from "@clerk/clerk-react";

// Wraps an API call for a sensitive action (refunds, role changes). When the server asks for a fresh
// identity check it answers 403 with a Clerk "reverification" body: handing that body back to Clerk's hook
// makes it show its confirm dialog and then run the call again. Everything else behaves as before.
export function useSensitive(call) {
  return useReverification(async (...args) => {
    try {
      return await call(...args);
    } catch (error) {
      const body = error.response?.data;
      if (body?.clerk_error?.reason === "reverification-error") return body;
      throw error;
    }
  });
}

// closing Clerk's confirm dialog is not an error worth showing
export const wasCancelled = (error) => error?.code === "reverification_cancelled" || /cancel/i.test(error?.name || "");
