import mongoose from "mongoose";
import { Product } from "../models/product.model.js";

// Products waiting for review, rejected, or paused (their vendor was paused) are not for sale.
// $nin also matches products saved before this field existed, so they stay visible.
export const ON_SALE = { status: { $nin: ["pending", "rejected", "paused"] } };

export async function getShopProducts(_, res) {
  try {
    const products = await Product.find(ON_SALE).sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getProductById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: "Product not found" });
    const product = await Product.findOne({ _id: id, ...ON_SALE });

    if (!product) return res.status(404).json({ message: "Product not found" });

    res.status(200).json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}
