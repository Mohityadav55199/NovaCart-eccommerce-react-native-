import "./setup.js";
import test, { before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { stripe } from "../src/config/stripe.js";
import { Cart } from "../src/models/cart.model.js";
import { Product } from "../src/models/product.model.js";
import { User } from "../src/models/user.model.js";
import { buildUserDoc } from "../src/utils/user.js";
import { getCart } from "../src/controllers/cart.controller.js";
import { createPaymentIntent } from "../src/controllers/payment.controller.js";

let mongod;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

after(async () => {
  mock.restoreAll();
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  mock.restoreAll();
  await Promise.all([Cart.deleteMany({}), Product.deleteMany({}), User.deleteMany({})]);
});

// the smallest Express-like response the controllers need
const fakeRes = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
};

const makeProduct = (fields = {}) =>
  Product.create({ name: "Mug", description: "A mug", price: 12.5, stock: 10, category: "Home", images: ["m.png"], ...fields });

const makeUser = (fields = {}) =>
  User.create({ ...buildUserDoc({ clerkId: "clerk_buyer", email: "buyer@example.com", firstName: "Buyer" }), ...fields });

test("the cart drops products that were deleted or taken off sale, and keeps the rest", async () => {
  const user = await makeUser();
  const kept = await makeProduct({ name: "Kept" });
  const paused = await makeProduct({ name: "Paused", status: "paused" });
  const deleted = await makeProduct({ name: "Deleted" });
  await Cart.create({
    user: user._id,
    clerkId: user.clerkId,
    items: [{ product: kept._id, quantity: 1 }, { product: paused._id, quantity: 2 }, { product: deleted._id, quantity: 1 }],
  });
  await Product.deleteOne({ _id: deleted._id });

  const res = fakeRes();
  await getCart({ user }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.cart.items.map((item) => item.product.name), ["Kept"]);
  // removed for good, so checkout no longer trips over them
  assert.equal((await Cart.findOne({ clerkId: user.clerkId })).items.length, 1);
});

test("checkout recovers when the saved Stripe customer no longer exists", async () => {
  const user = await makeUser({ stripeCustomerId: "cus_from_old_test_mode" });
  const product = await makeProduct();

  mock.method(stripe.customers, "retrieve", async () => {
    throw Object.assign(new Error("No such customer"), { code: "resource_missing" });
  });
  const created = mock.method(stripe.customers, "create", async () => ({ id: "cus_new" }));
  const intent = mock.method(stripe.paymentIntents, "create", async (params) => ({ client_secret: `secret_for_${params.customer}` }));

  const res = fakeRes();
  await createPaymentIntent(
    {
      user,
      body: {
        cartItems: [{ product: { _id: product._id.toString() }, quantity: 2 }],
        shippingAddress: { fullName: "B", streetAddress: "1 St", city: "C", state: "S", zipCode: "1", phoneNumber: "1" },
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.clientSecret, "secret_for_cus_new");
  assert.equal(created.mock.callCount(), 1);
  // 2 x $12.50 = $25.00 + $10 shipping + $2.00 tax, charged in cents
  assert.equal(intent.mock.calls[0].arguments[0].amount, 3700);
  assert.equal((await User.findById(user._id)).stripeCustomerId, "cus_new");
});

test("checkout rejects a malformed product id with 400 instead of crashing", async () => {
  const user = await makeUser();
  const res = fakeRes();
  await createPaymentIntent(
    {
      user,
      body: {
        cartItems: [{ product: { _id: "not-an-id" }, quantity: 1 }],
        shippingAddress: { fullName: "B", streetAddress: "1 St", city: "C", state: "S", zipCode: "1", phoneNumber: "1" },
      },
    },
    res
  );
  assert.equal(res.statusCode, 400);
});
