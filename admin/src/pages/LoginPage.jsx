import { createElement, useState } from "react";
import { Link } from "react-router";
import { SignIn } from "@clerk/clerk-react";
import { ShieldCheckIcon, ShoppingBagIcon, StoreIcon } from "lucide-react";
import { readMode, writeMode } from "../lib/mode";
import RenderBanner from "../components/RenderBanner";

const MODES = [
  { id: "customer", label: "Customer", hint: "Your account and orders", icon: ShoppingBagIcon },
  { id: "vendor", label: "Vendor", hint: "Sell and manage your store. Admins sign in here too.", icon: StoreIcon },
];

// The choice is only which workspace to open: the same account can use either on different days.
// What the account may actually do is decided by the server, never by this choice.
function LoginPage() {
  const [mode, setMode] = useState(() => readMode() || "vendor");

  const choose = (id) => {
    setMode(id);
    writeMode(id);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 p-4">
      <div className="w-full max-w-sm">
        <RenderBanner className="mb-4" />
        <p className="text-sm text-center opacity-70 mb-2">Sign in as</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Sign in as">
          {MODES.map(({ id, label, hint, icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => choose(id)}
              className={`rounded-xl border p-3 text-left transition ${
                mode === id ? "border-primary bg-primary/10" : "border-base-300 hover:border-primary/50"
              }`}
            >
              {createElement(icon, { className: "size-5 mb-1" })}
              <p className="font-semibold text-sm">{label}</p>
              <p className="text-xs opacity-60">{hint}</p>
            </button>
          ))}
        </div>
        <p className="text-xs text-center opacity-60 mt-2 flex items-center justify-center gap-1">
          <ShieldCheckIcon className="size-3.5" /> Your role comes from your account, not from this choice.
        </p>
      </div>

      <SignIn signUpUrl="/register" />

      <p className="text-sm opacity-70">
        New here?{" "}
        <Link to="/register" className="link link-primary">
          Create an account
        </Link>
      </p>
    </div>
  );
}
export default LoginPage;
