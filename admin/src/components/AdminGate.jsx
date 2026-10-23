import { useState } from "react";
import { useAuth, useClerk } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../lib/api";
import { describeError } from "../lib/errors";
import { RoleContext } from "../lib/role";
import { LOGIN_AS_KEY } from "../lib/loginAs";
import AccessDenied from "./AccessDenied";
import PageLoader from "./PageLoader";

// remember the verified role per user so a returning visit renders at once (it is re-checked in the background)
const cacheKey = (userId) => `novacart:role:${userId}`;
const readCached = (userId) => {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(userId)) || "null");
  } catch {
    return null;
  }
};
const writeCached = (userId, value) => {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(value));
  } catch {
    /* storage unavailable: just skip the shortcut */
  }
};
const readLoginAs = () => {
  try {
    return sessionStorage.getItem(LOGIN_AS_KEY);
  } catch {
    return null;
  }
};
const clearLoginAs = () => {
  try {
    sessionStorage.removeItem(LOGIN_AS_KEY);
  } catch {
    /* ignore */
  }
};

// asks the API whether this account is an admin or vendor before any admin screen is rendered.
// The API still enforces every permission: this is only what the screen shows.
function AdminGate({ children }) {
  const { userId } = useAuth();
  const { signOut } = useClerk();
  const [acceptedRole, setAcceptedRole] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["adminCheck", userId],
    queryFn: async () => {
      const result = await adminApi.check();
      writeCached(userId, result);
      return result;
    },
    // a cached answer shows the dashboard immediately; initialDataUpdatedAt 0 makes it refetch right away
    initialData: () => readCached(userId) ?? undefined,
    initialDataUpdatedAt: 0,
    // a 401/403 is a definite answer; only retry network hiccups (e.g. Render waking up)
    retry: (failureCount, err) => ![401, 403].includes(err?.response?.status) && failureCount < 3,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <PageLoader />;

  if (isError) {
    if ([401, 403].includes(error?.response?.status)) {
      writeCached(userId, null);
      return <AccessDenied />;
    }

    // the cached role is still usable while the API is unreachable
    if (!data) {
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
  }

  // signed in with a different role than the one picked on the sign-in page
  const wanted = readLoginAs();
  if (wanted && wanted !== data.role && !acceptedRole) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card bg-base-100 shadow-xl max-w-md w-full">
          <div className="card-body items-center text-center gap-3">
            <h1 className="card-title text-2xl">This account is a {data.role}</h1>
            <p className="text-base-content/70">
              You chose to sign in as {wanted}, but this account has {data.role} access. Roles are set by the store
              owner, so you can continue as a {data.role} or sign in with a different account.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                clearLoginAs();
                setAcceptedRole(true);
              }}
            >
              Continue as {data.role}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                clearLoginAs();
                signOut({ redirectUrl: "/login" });
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (wanted) clearLoginAs(); // matched: nothing more to ask

  return <RoleContext.Provider value={{ role: data.role, name: data.name }}>{children}</RoleContext.Provider>;
}

export default AdminGate;
