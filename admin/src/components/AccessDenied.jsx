import { useClerk, useUser } from "@clerk/clerk-react";
import { ShieldAlertIcon } from "lucide-react";

// shown to signed-in accounts that are not admins: nothing from the dashboard is rendered
function AccessDenied() {
  const { signOut } = useClerk();
  const { user } = useUser();

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card bg-base-100 shadow-xl max-w-md w-full">
        <div className="card-body items-center text-center gap-3">
          <ShieldAlertIcon className="size-14 text-error" />
          <h1 className="card-title text-2xl">We couldn&apos;t verify this account</h1>
          <p className="text-base-content/70">
            {user?.primaryEmailAddress?.emailAddress
              ? `The server did not accept the sign-in for ${user.primaryEmailAddress.emailAddress}.`
              : "The server did not accept this sign-in."}{" "}
            Sign out and try again. If it keeps happening, contact the store owner.
          </p>
          <button className="btn btn-primary mt-2" onClick={() => signOut({ redirectUrl: "/login" })}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export default AccessDenied;
