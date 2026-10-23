import { Product } from "../models/product.model.js";

// A vendor's products that are on sale are hidden while the vendor is paused or removed, and come back when
// that is lifted. Products still waiting for review (or rejected) are left alone.
export async function setVendorProductsHidden(vendorId, hidden) {
  if (hidden) await Product.updateMany({ vendor: vendorId, status: "approved" }, { $set: { status: "paused" } });
  else await Product.updateMany({ vendor: vendorId, status: "paused" }, { $set: { status: "approved" } });
}
