import { UserButton } from "@clerk/clerk-react";
import { useLocation } from "react-router";
import { useRole } from "../lib/role";

import {
  ClipboardListIcon,
  HomeIcon,
  PanelLeftIcon,
  ScrollTextIcon,
  ShoppingBagIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";

// eslint-disable-next-line
export const NAVIGATION = [
  // `perm`: shown to anyone who has it (whole or ":own"); the server checks it again on every request
  { name: "Dashboard", path: "/dashboard", icon: <HomeIcon className="size-5" />, perm: "dashboard:view" },
  { name: "Products", path: "/products", icon: <ShoppingBagIcon className="size-5" />, perm: "products:read" },
  { name: "Orders", path: "/orders", icon: <ClipboardListIcon className="size-5" />, perm: "orders:view" },
  { name: "Payouts", path: "/payouts", icon: <WalletIcon className="size-5" />, perm: "payouts:view" },
  { name: "Customers", path: "/customers", icon: <UsersIcon className="size-5" />, perm: "customers:view" },
  { name: "Audit log", path: "/audit", icon: <ScrollTextIcon className="size-5" />, perm: "audit:view" },
];

function Navbar() {
  const location = useLocation();
  const { setMode } = useRole();

  return (
    <div className="navbar w-full bg-base-300">
      <label htmlFor="my-drawer" className="btn btn-square btn-ghost" aria-label="open sidebar">
        <PanelLeftIcon className="size-5" />
      </label>

      <div className="flex-1 px-4">
        <h1 className="text-xl font-bold">
          {NAVIGATION.find((item) => item.path === location.pathname)?.name || "Dashboard"}
        </h1>
      </div>

      <button className="btn btn-ghost btn-sm mr-2" onClick={() => setMode("customer")}>
        Customer view
      </button>

      <div className="mr-5">
        <UserButton />
      </div>
    </div>
  );
}

export default Navbar;
