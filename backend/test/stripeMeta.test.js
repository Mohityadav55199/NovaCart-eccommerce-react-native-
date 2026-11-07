import test from "node:test";
import assert from "node:assert/strict";
import { MAX_METADATA_KEYS, packMeta, unpackMeta } from "../src/utils/stripeMeta.js";

test("short values fit one key and round-trip", () => {
  const packed = packMeta("items", "hello");
  assert.deepEqual(packed, { items_0: "hello" });
  assert.equal(unpackMeta("items", packed), "hello");
});

test("long values are split under the 500 character limit and join back unchanged", () => {
  const text = JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ p: `id${i}`.padEnd(24, "x"), q: i + 1, pr: 9.99 })));
  const packed = packMeta("items", text);
  assert.ok(Object.keys(packed).length > 1);
  for (const value of Object.values(packed)) assert.ok(value.length <= 500);
  assert.equal(unpackMeta("items", packed), text);
});

test("unpacking a prefix that is not there gives an empty string", () => {
  assert.equal(unpackMeta("address", { items_0: "x" }), "");
});

test("the key limit matches Stripe's", () => {
  assert.equal(MAX_METADATA_KEYS, 50);
});
