import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { userApi } from "../lib/api";
import { describeError } from "../lib/errors";
import { readMode, writeMode } from "../lib/mode";
import { RoleContext } from "../lib/role";
import AccessDenied from "./AccessDenied";
import BecomeVendor from "./BecomeVendor";
import CustomerHome from "./CustomerHome";
import PageLoader from "./PageLoader";

// remember the verified account per user so a returning visit renders at once (it is re-checked in the background)
const cacheKey = (userId) => `novacart:me:${userId}`;
const readCached = (userId) => {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(userId)) || "null");
  } catch {
    return null;
  }
};
const writeCached = (userId, value) => {
  try {
    if (value) localStorage.setItem(cacheKey(userId), JSON.stringify(value));
    else localStorage.removeItem(cacheKey(userId));
  } catch {
    /* storage unavailable: just skip the shortcut */
  }
};

// Decides what to show after sign-in, from what the API says about the account:
//  - "customer" view: the customer home (offers "become a vendor" or "open dashboard")
//  - "vendor" view: the dashboard for vendors and admins, or the become-a-vendor form for everyone else
// The view is only a choice of screen; the API checks every request itself.
function AdminGate({ children }) {
  const { userId } = useAuth();
  const [mode, setModeState] = useState(() => readMode() || "vendor");

  const setMode = (next) => {
    writeMode(next);
    setModeState(next);
  };

  const { data: me, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["me", userId],
    queryFn: async () => {
      const result = await userApi.me();
      writeCached(userId, result);
      return result;
    },
    // a cached answer shows the screen immediately; initialDataUpdatedAt 0 makes it refetch right away
    initialData: () => readCached(userId) ?? undefined,
    initialDataUpdatedAt: 0,
    // 401/403 are definite answers; only retry network hiccups (e.g. Render waking up)
    retry: (failureCount, err) => ![401, 403].includes(err?.response?.status) && failureCount < 3,
    staleTime: 5 * 60 * 1000,
  });

  const rejected = isError && [401, 403].includes(error?.response?.status);

  useEffect(() => {
    if (rejected) writeCached(userId, null); // forget a cached account the server no longer accepts
  }, [rejected, userId]);

  if (isLoading) return <PageLoader />;

  if (rejected) return <AccessDenied />;

  // unreachable and nothing cached
  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-error">Couldn&apos;t reach the server ({describeError(error)}).</p>
          <p className="text-sm text-base-content/70">The API may be waking up, which can take up to a minute.</p>
          <button className="btn btn-primary" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const canSell = me.roles.includes("vendor") || me.role === "admin";

  if (mode === "customer") return <CustomerHome me={me} canSell={canSell} setMode={setMode} />;

  if (!canSell) return <BecomeVendor me={me} setMode={setMode} />;

  return <RoleContext.Provider value={{ role: me.role, name: me.name, setMode }}>{children}</RoleContext.Provider>;
}

export default AdminGate;
