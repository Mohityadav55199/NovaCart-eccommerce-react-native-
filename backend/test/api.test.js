import "./setup.js";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test("GET /api/health answers 200", async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: "Success" });
});

test("an unknown API route answers 404 JSON, not an HTML page", async () => {
  const response = await fetch(`${base}/api/does-not-exist`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type"), /json/);
  assert.deepEqual(await response.json(), { error: "Endpoint not found" });
});

test("protected routes refuse a request that is not signed in", async () => {
  for (const path of ["/api/cart", "/api/orders", "/api/users/me", "/api/admin/products"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 401, path);
  }
});

test("the Stripe webhook rejects a request without a valid signature", async () => {
  const response = await fetch(`${base}/api/payment/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=bad" },
    body: "{}",
  });
  assert.equal(response.status, 400);
});

test("security headers are set and the framework is not advertised", async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-powered-by"), null);
});
