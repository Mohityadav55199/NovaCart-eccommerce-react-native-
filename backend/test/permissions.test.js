import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { permissionsFor, scopeOf } from "../src/config/permissions.js";
import { getRole, getRoles, isAdminEmail } from "../src/middleware/auth.middleware.js";

test("a customer has no staff permissions", () => {
  assert.equal(scopeOf(permissionsFor(["customer"]), "orders:view"), null);
});

test("a vendor is limited to their own data", () => {
  const perms = permissionsFor(["customer", "vendor"]);
  assert.equal(scopeOf(perms, "orders:view"), "own");
  assert.equal(scopeOf(perms, "products:write"), "own");
  assert.equal(scopeOf(perms, "customers:manage"), null);
  assert.equal(scopeOf(perms, "orders:refund"), null);
});

test("support can see and refund everything but cannot change products", () => {
  const perms = permissionsFor(["support"]);
  assert.equal(scopeOf(perms, "orders:view"), "all");
  assert.equal(scopeOf(perms, "orders:refund"), "all");
  assert.equal(scopeOf(perms, "products:write"), null);
});

test("an admin has every permission with full scope", () => {
  const perms = permissionsFor(["admin"]);
  assert.equal(scopeOf(perms, "audit:view"), "all");
  assert.equal(scopeOf(perms, "orders:refund:approve"), "all");
});

test("roles held together are combined", () => {
  const perms = permissionsFor(["support", "vendor"]);
  assert.equal(scopeOf(perms, "orders:view"), "all"); // support's wider scope wins
  assert.equal(scopeOf(perms, "payouts:view"), "own");
});

test("admin comes only from ADMIN_EMAIL (case-insensitive, comma separated)", () => {
  assert.ok(isAdminEmail("BOSS@example.com"));
  assert.ok(isAdminEmail("second@example.com"));
  assert.ok(!isAdminEmail("someone@example.com"));
  assert.ok(!isAdminEmail(undefined));
});

test("an admin email that Clerk has not verified does not grant admin", () => {
  assert.ok(getRoles({ email: "boss@example.com", emailVerified: true, roles: [] }).includes("admin"));
  assert.ok(!getRoles({ email: "boss@example.com", emailVerified: false, roles: [] }).includes("admin"));
});

test("the highest role decides what the admin site shows", () => {
  assert.equal(getRole({ email: "a@b.c", roles: [] }), "customer");
  assert.equal(getRole({ email: "a@b.c", roles: ["vendor"] }), "vendor");
  assert.equal(getRole({ email: "a@b.c", roles: ["vendor", "support"] }), "support");
  assert.equal(getRole({ email: "boss@example.com", emailVerified: true, roles: ["vendor"] }), "admin");
});
