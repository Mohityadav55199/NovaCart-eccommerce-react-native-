import { createElement, useState } from "react";
import { SignIn } from "@clerk/clerk-react";
import { ShieldCheckIcon, StoreIcon } from "lucide-react";
import { LOGIN_AS_KEY } from "../lib/loginAs";


const ROLES = [
  { id: "admin", label: "Admin", hint: "Manage the whole store", icon: ShieldCheckIcon },
  { id: "vendor", label: "Vendor", hint: "Manage your products and orders", icon: StoreIcon },
];

const readSaved = () => {
  try {
    return sessionStorage.getItem(LOGIN_AS_KEY) || "admin";
  } catch {
    return "admin";
  }
};

// The choice only says which workspace you expect. The server decides your real role,
// so picking "Admin" with a vendor account never grants anything (AdminGate shows the mismatch).
function LoginPage() {
  const [loginAs, setLoginAs] = useState(readSaved);

  const choose = (id) => {
    setLoginAs(id);
    try {
      sessionStorage.setItem(LOGIN_AS_KEY, id);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 p-4">
      <div className="w-full max-w-sm">
        <p className="text-sm text-center opacity-70 mb-2">Sign in as</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Sign in as">
          {ROLES.map(({ id, label, hint, icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={loginAs === id}
              onClick={() => choose(id)}
              className={`rounded-xl border p-3 text-left transition ${
                loginAs === id ? "border-primary bg-primary/10" : "border-base-300 hover:border-primary/50"
              }`}
            >
              {createElement(icon, { className: "size-5 mb-1" })}
              <p className="font-semibold text-sm">{label}</p>
              <p className="text-xs opacity-60">{hint}</p>
            </button>
          ))}
        </div>
        <p className="text-xs text-center opacity-60 mt-2">
          Shopping as a customer? Use the NovaCart mobile app.
        </p>
      </div>

      <SignIn />
    </div>
  );
}
export default LoginPage;
