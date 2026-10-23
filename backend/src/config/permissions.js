// Named permissions. Roles are just sets of them, and every protected route asks for a permission,
// never for a role name.
//
// "x:own" means the same action limited to the person's own data (a vendor's products and orders).
// A permission without ":own" covers everything. Admin has all of them.

export const PERMISSIONS = [
  "dashboard:view",
  "products:read",
  "products:write",
  "products:review", // approve or reject vendor products
  "orders:view",
  "orders:fulfil",
  "orders:refund", // cancel an unshipped order and refund it
  "orders:refund:approve", // approve a refund that is over the person's limit
  "customers:view",
  "customers:manage", // roles, pausing vendors
  "audit:view",
  "payouts:view",
];

const OWN = (permission) => `${permission}:own`;

export const ROLE_PERMISSIONS = {
  // sees orders and customers and can refund up to SUPPORT_REFUND_LIMIT, but cannot change products
  support: ["dashboard:view", "orders:view", "orders:refund", "customers:view"],
  vendor: [
    OWN("dashboard:view"),
    OWN("products:read"),
    OWN("products:write"),
    OWN("orders:view"),
    OWN("orders:fulfil"),
    OWN("payouts:view"),
  ],
  customer: [],
};

// the permissions a person has, from every role they hold (one person can be support and vendor, ...)
export function permissionsFor(roles) {
  if (roles.includes("admin")) return new Set(PERMISSIONS.flatMap((p) => [p, OWN(p)]));

  const set = new Set();
  for (const role of roles) for (const permission of ROLE_PERMISSIONS[role] || []) set.add(permission);
  return set;
}

// "all" when the permission covers everything, "own" when only the person's own data, otherwise null
export function scopeOf(permissions, permission) {
  if (permissions.has(permission)) return "all";
  if (permissions.has(OWN(permission))) return "own";
  return null;
}
