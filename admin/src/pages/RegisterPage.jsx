import { createElement, useEffect, useState } from "react";
import { Link } from "react-router";
import { SignUp } from "@clerk/clerk-react";
import { CheckIcon, ShoppingBagIcon, StoreIcon } from "lucide-react";
import { writeMode } from "../lib/mode";

const OPTIONS = [
  { id: "customer", label: "Customer", hint: "Shop in the NovaCart app", Icon: ShoppingBagIcon },
  { id: "vendor", label: "Vendor", hint: "Sell your products", Icon: StoreIcon },
];

// Everyone is a customer, and anyone can also sell. Picking both creates one account that can use either.
// Vendor is added after sign-up (store name step), and only through the API.
function RegisterPage() {
  const [selected, setSelected] = useState(["customer"]);

  // vendor if selling was chosen (they can switch to the customer view any time), otherwise customer.
  // Runs on first render too, so a sign-up that leaves the default choice still saves it.
  useEffect(() => {
    writeMode(selected.includes("vendor") ? "vendor" : "customer");
  }, [selected]);

  const toggle = (id) => {
    const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
    if (next.length === 0) return; // at least one
    setSelected(next);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 p-4">
      <div className="w-full max-w-sm">
        <p className="text-sm text-center opacity-70 mb-2">I want to (pick one or both)</p>
        <div className="grid grid-cols-2 gap-2">
          {OPTIONS.map(({ id, label, hint, Icon }) => {
            const on = selected.includes(id);
            return (
              <button
                key={id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(id)}
                className={`relative rounded-xl border p-3 text-left transition ${
                  on ? "border-primary bg-primary/10" : "border-base-300 hover:border-primary/50"
                }`}
              >
                {on && <CheckIcon className="size-4 absolute right-2 top-2 text-primary" />}
                {createElement(Icon, { className: "size-5 mb-1" })}
                <p className="font-semibold text-sm">{label}</p>
                <p className="text-xs opacity-60">{hint}</p>
              </button>
            );
          })}
        </div>
      </div>

      <SignUp signInUrl="/login" />

      <p className="text-sm opacity-70">
        Already have an account?{" "}
        <Link to="/login" className="link link-primary">
          Sign in
        </Link>
      </p>
    </div>
  );
}
export default RegisterPage;
