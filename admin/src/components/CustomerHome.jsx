import { useClerk } from "@clerk/clerk-react";
import { ShoppingBagIcon, SmartphoneIcon, StoreIcon } from "lucide-react";
import Avatar from "./Avatar";

// what a person sees on the web when they sign in as a customer
function CustomerHome({ me, canSell, setMode }) {
  const { signOut } = useClerk();

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card bg-base-100 shadow-xl max-w-md w-full">
        <div className="card-body gap-4 items-center text-center">
          <Avatar src={me.imageUrl} name={me.name} className="size-16" />
          <div>
            <h1 className="card-title text-2xl justify-center">Hi, {me.name}</h1>
            <p className="text-sm opacity-60">{me.email}</p>
          </div>

          <div className="rounded-xl bg-base-200 p-4 w-full text-left text-sm space-y-1">
            <p className="font-semibold flex items-center gap-2">
              <SmartphoneIcon className="size-4" /> Shopping happens in the app
            </p>
            <p className="opacity-70">
              Browse products, check out and track your orders in the NovaCart mobile app. Sign in there with this same
              account.
            </p>
          </div>

          {canSell ? (
            <button className="btn btn-primary w-full" onClick={() => setMode("vendor")}>
              <StoreIcon className="size-4" /> Open {me.role === "admin" ? "admin" : "vendor"} dashboard
            </button>
          ) : (
            <div className="w-full space-y-2">
              <button className="btn btn-primary w-full" onClick={() => setMode("vendor")}>
                <StoreIcon className="size-4" /> Become a vendor and start selling
              </button>
              <p className="text-xs opacity-60">Free and instant. You stay a customer too.</p>
            </div>
          )}

          <button className="btn btn-ghost btn-sm" onClick={() => signOut({ redirectUrl: "/login" })}>
            <ShoppingBagIcon className="size-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export default CustomerHome;
