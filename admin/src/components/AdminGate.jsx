import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../lib/api";
import { describeError } from "../lib/errors";
import AccessDenied from "./AccessDenied";
import PageLoader from "./PageLoader";

// asks the API whether this account is an admin before any admin screen is rendered
function AdminGate({ children }) {
  const { isLoading, isError, error, refetch } = useQuery({
    queryKey: ["adminCheck"],
    queryFn: adminApi.check,
    // a 401/403 is a definite answer; only retry network hiccups (e.g. Render waking up)
    retry: (failureCount, err) => ![401, 403].includes(err?.response?.status) && failureCount < 3,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <PageLoader />;

  if (isError) {
    if ([401, 403].includes(error?.response?.status)) return <AccessDenied />;

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

  return children;
}

export default AdminGate;
