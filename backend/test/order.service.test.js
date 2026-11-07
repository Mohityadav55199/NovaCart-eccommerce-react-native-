import "./setup.js";
import test, { before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { stripe } from "../src/config/stripe.js";
import { Order } from "../src/models/order.model.js";
import { Product } from "../src/models/product.model.js";
import { User } from "../src/models/user.model.js";
import { buildUserDoc } from "../src/utils/user.js";
import { cancelOrder, cancelAsStaff, decideRefundRequest } from "../src/services/order.service.js";

// A real MongoDB (in memory) with Stripe replaced by a fake: the refund and stock rules are tested
// end to end without any network or paid service.
let mongod;
let refundCalls;
let refundShouldFail;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Order.syncIndexes();

  mock.method(stripe.refunds, "create", async (params) => {
    refundCalls.push(params);
    if (refundShouldFail) throw new Error("stripe is down");
    return { id: `re_${refundCalls.length}`, amount: 5000 };
  });
});

after(async () => {
  mock.restoreAll();
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  refundCalls = [];
  refundShouldFail = false;
  await Promise.all([Order.deleteMany({}), Product.deleteMany({}), User.deleteMany({})]);
});

const makeUser = (email) =>
  User.create(buildUserDoc({ clerkId: `clerk_${email}`, email, firstName: email.split("@")[0] }));

// a paid order with one item; `stock` is what is left on the shelf after the sale
async function makeOrder({ total = 50, stock = 4, quantity = 1, status = "pending" } = {}) {
  const customer = await makeUser(`buyer${Date.now()}${Math.random()}@example.com`);
  const product = await Product.create({ name: "Lamp", description: "A lamp", price: total, stock, category: "Home", images: ["x.png"] });
  const order = await Order.create({
    user: customer._id,
    clerkId: customer.clerkId,
    orderItems: [{ product: product._id, name: "Lamp", price: total, quantity, status }],
    shippingAddress: { fullName: "A", streetAddress: "1 St", city: "C", state: "S", zipCode: "1", phoneNumber: "1" },
    paymentResult: { id: `pi_${Math.random()}`, status: "succeeded" },
    totalPrice: total,
    status,
  });
  return { order, product };
}

const asStaff = (role, user) => ({ role, user });

test("cancelling a pending order refunds it, restocks the product and records who did it", async () => {
  const { order, product } = await makeOrder({ stock: 4, quantity: 2 });

  const cancelled = await cancelOrder(order._id, { reason: "changed my mind", by: "customer" });

  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.paymentResult.status, "refunded");
  assert.equal(cancelled.cancellation.by, "customer");
  assert.equal(cancelled.cancellation.reason, "changed my mind");
  assert.equal(refundCalls.length, 1);
  assert.equal(refundCalls[0].payment_intent, order.paymentResult.id);
  assert.equal((await Product.findById(product._id)).stock, 6);
});

test("two cancel requests at the same moment refund and restock only once", async () => {
  const { order, product } = await makeOrder({ stock: 4, quantity: 1 });

  const results = await Promise.allSettled([
    cancelOrder(order._id, { by: "customer" }),
    cancelOrder(order._id, { by: "customer" }),
  ]);

  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(refundCalls.length, 1);
  assert.equal((await Product.findById(product._id)).stock, 5);
});

test("an order that has shipped cannot be cancelled and nothing is refunded", async () => {
  const { order } = await makeOrder({ status: "shipped" });

  await assert.rejects(cancelOrder(order._id, { by: "customer" }), { status: 400, message: /already shipped/ });
  assert.equal(refundCalls.length, 0);
});

test("if Stripe fails the order is left untouched and the stock unchanged", async () => {
  const { order, product } = await makeOrder({ stock: 4 });
  refundShouldFail = true;

  await assert.rejects(cancelOrder(order._id, { by: "customer" }), { status: 502 });

  const after = await Order.findById(order._id);
  assert.equal(after.status, "pending");
  assert.equal(after.orderItems[0].status, "pending");
  assert.equal((await Product.findById(product._id)).stock, 4);
});

test("support refunds within their limit immediately", async () => {
  const { order } = await makeOrder({ total: 80 }); // limit is $100
  const support = await makeUser("support@example.com");

  const result = await cancelAsStaff(order._id, { reason: "damaged", actor: asStaff("support", support) });

  assert.equal(result.done, true);
  assert.equal(result.order.status, "cancelled");
  assert.equal(refundCalls.length, 1);
});

test("support refunds above their limit wait for an admin and move no money yet", async () => {
  const { order } = await makeOrder({ total: 250 });
  const support = await makeUser("support@example.com");

  const result = await cancelAsStaff(order._id, { reason: "big one", actor: asStaff("support", support) });

  assert.equal(result.done, false);
  assert.equal(result.order.status, "pending");
  assert.equal(result.order.refundRequest.status, "pending");
  assert.equal(refundCalls.length, 0);

  // asking again while one is waiting is refused
  await assert.rejects(cancelAsStaff(order._id, { actor: asStaff("support", support) }), { status: 409 });
});

test("an admin cannot approve their own refund when another admin exists, but the other admin can", async () => {
  const first = await makeUser("boss@example.com"); // both emails are in ADMIN_EMAIL (see setup.js)
  const second = await makeUser("second@example.com");
  await User.updateMany({}, { emailVerified: true });

  const { order } = await makeOrder({ total: 700 }); // above the admin limit of $500
  const requested = await cancelAsStaff(order._id, { reason: "fraud", actor: asStaff("admin", first) });
  assert.equal(requested.done, false);

  await assert.rejects(decideRefundRequest(order._id, "approve", { actor: asStaff("admin", first) }), { status: 403 });
  assert.equal(refundCalls.length, 0);

  const approved = await decideRefundRequest(order._id, "approve", { actor: asStaff("admin", second) });
  assert.equal(approved.status, "cancelled");
  assert.equal(refundCalls.length, 1);
});

test("rejecting a refund request keeps the order and moves no money", async () => {
  const { order } = await makeOrder({ total: 250 });
  const support = await makeUser("support@example.com");
  const admin = await makeUser("boss@example.com");
  await cancelAsStaff(order._id, { actor: asStaff("support", support) });

  const result = await decideRefundRequest(order._id, "reject", { actor: asStaff("admin", admin), note: "not justified" });

  assert.equal(result.status, "pending");
  assert.equal(result.refundRequest.status, "rejected");
  assert.equal(refundCalls.length, 0);
});
