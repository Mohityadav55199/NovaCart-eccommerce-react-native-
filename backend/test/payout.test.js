import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { splitAmount } from "../src/services/payout.service.js";

test("the platform keeps its fee and the vendor gets the rest, in cents", () => {
  // default fee is 10%: $25.00 x 2 = $50.00 -> fee $5.00, vendor $45.00
  assert.deepEqual(splitAmount({ price: 25, quantity: 2 }), { gross: 5000, fee: 500, net: 4500 });
});

test("fee and payout always add up to the price, even when the fee does not divide evenly", () => {
  for (const price of [0.99, 3.33, 19.99, 100.01]) {
    const { gross, fee, net } = splitAmount({ price, quantity: 3 });
    assert.equal(fee + net, gross);
    assert.ok(Number.isInteger(fee) && Number.isInteger(net));
  }
});
