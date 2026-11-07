import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { computePricing } from "../src/config/pricing.js";

test("orders under $100 pay $10 shipping and 8% tax", () => {
  assert.deepEqual(computePricing(50), { subtotal: 50, shipping: 10, tax: 4, total: 64 });
});

test("orders of $100 or more ship free", () => {
  const result = computePricing(100);
  assert.equal(result.shipping, 0);
  assert.equal(result.total, 108);
});

test("totals are whole cents, with no floating point drift", () => {
  // 19.99 * 0.08 = 1.5992 -> 1.60
  const { tax, total } = computePricing(19.99);
  assert.equal(tax, 1.6);
  assert.equal(total, 31.59);
  for (const subtotal of [0.1 + 0.2, 33.33, 99.99, 1234.56]) {
    const result = computePricing(subtotal);
    assert.equal(result.tax, Math.round(result.tax * 100) / 100);
    assert.equal(result.total, Math.round(result.total * 100) / 100);
  }
});
