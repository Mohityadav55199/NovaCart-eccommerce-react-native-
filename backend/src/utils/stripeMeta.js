// Stripe metadata allows 50 keys of at most 500 characters each. Long values (the cart) are split over
// numbered keys (items_0, items_1, ...) and joined again in the webhook.
const CHUNK = 480;
export const MAX_METADATA_KEYS = 50;

export function packMeta(prefix, text) {
  const out = {};
  for (let start = 0, n = 0; start < text.length; start += CHUNK, n++) {
    out[`${prefix}_${n}`] = text.slice(start, start + CHUNK);
  }
  return out;
}

export function unpackMeta(prefix, metadata) {
  let text = "";
  for (let n = 0; metadata[`${prefix}_${n}`] !== undefined; n++) text += metadata[`${prefix}_${n}`];
  return text;
}
