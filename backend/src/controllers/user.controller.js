import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { Product } from "../models/product.model.js";
import { getPermissions, getRole, getRoles } from "../middleware/auth.middleware.js";

export async function addAddress(req, res) {
  try {
    const { label, fullName, streetAddress, city, state, zipCode, phoneNumber, isDefault } =
      req.body;

    const user = req.user;

    if (!label || !fullName || !streetAddress || !city || !state || !zipCode || !phoneNumber) {
      return res.status(400).json({ error: "Missing required address fields" });
    }

    // if this is set as default, unset all other defaults
    if (isDefault) {
      user.addresses.forEach((addr) => {
        addr.isDefault = false;
      });
    }

    user.addresses.push({
      label,
      fullName,
      streetAddress,
      city,
      state,
      zipCode,
      phoneNumber,
      isDefault: isDefault || false,
    });

    await user.save();

    res.status(201).json({ message: "Address added successfully", addresses: user.addresses });
  } catch (error) {
    console.error("Error in addAddress controller:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getAddresses(req, res) {
  try {
    const user = req.user;

    res.status(200).json({ addresses: user.addresses });
  } catch (error) {
    console.error("Error in getAddresses controller:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateAddress(req, res) {
  try {
    const { label, fullName, streetAddress, city, state, zipCode, phoneNumber, isDefault } =
      req.body;

    const { addressId } = req.params;

    const user = req.user;
    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({ error: "Address not found" });
    }

    // if this is set as default, unset all other defaults
    if (isDefault) {
      user.addresses.forEach((addr) => {
        addr.isDefault = false;
      });
    }

    address.label = label || address.label;
    address.fullName = fullName || address.fullName;
    address.streetAddress = streetAddress || address.streetAddress;
    address.city = city || address.city;
    address.state = state || address.state;
    address.zipCode = zipCode || address.zipCode;
    address.phoneNumber = phoneNumber || address.phoneNumber;
    address.isDefault = isDefault !== undefined ? isDefault : address.isDefault;

    await user.save();

    res.status(200).json({ message: "Address updated successfully", addresses: user.addresses });
  } catch (error) {
    console.error("Error in updateAddress controller:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function deleteAddress(req, res) {
  try {
    const { addressId } = req.params;
    const user = req.user;

    user.addresses.pull(addressId);
    await user.save();

    res.status(200).json({ message: "Address deleted successfully", addresses: user.addresses });
  } catch (error) {
    console.error("Error in deleteAddress controller:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function addToWishlist(req, res) {
  try {
    const { productId } = req.body;
    const user = req.user;

    if (!mongoose.isValidObjectId(productId) || !(await Product.exists({ _id: productId }))) {
      return res.status(404).json({ error: "Product not found" });
    }

    // check if product is already in the wishlist
    if (user.wishlist.includes(productId)) {
      return res.status(400).json({ error: "Product already in wishlist" });
    }

    user.wishlist.push(productId);
    await user.save();

    res.status(200).json({ message: "Product added to wishlist", wishlist: user.wishlist });
  } catch (error) {
    console.error("Error in addToWishlist controller:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function removeFromWishlist(req, res) {
  try {
    const { productId } = req.params;
    const user = req.user;

    // check if product is already in the wishlist
    if (!user.wishlist.includes(productId)) {
      return res.status(400).json({ error: "Product not found in wishlist" });
    }

    user.wishlist.pull(productId);
    await user.save();

    res.status(200).json({ message: "Product removed from wishlist", wishlist: user.wishlist });
  } catch (error) {
    console.error("Error in removeFromWishlist controller:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getWishlist(req, res) {
  try {
    // we're using populate, bc wishlist is just an array of product ids
    const user = await User.findById(req.user._id).populate("wishlist");

    res.status(200).json({ wishlist: user.wishlist });
  } catch (error) {
    console.error("Error in getWishlist controller:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}


const describeMe = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  imageUrl: user.imageUrl,
  role: getRole(user), // highest: "admin" | "vendor" | "customer"
  roles: getRoles(user),
  storeName: user.vendorProfile?.storeName || "",
  paused: !!user.vendorProfile?.paused,
  permissions: [...getPermissions(user)],
});

// the web portal asks this after sign-in to decide what to show
export async function getMe(req, res) {
  res.status(200).json({ user: describeMe(req.user) });
}

// anyone can start selling: adds the vendor role (a person can be a customer and a vendor)
export async function becomeVendor(req, res) {
  try {
    const storeName = String(req.body?.storeName || "").trim();
    if (storeName.length < 2 || storeName.length > 60) {
      return res.status(400).json({ error: "Store name must be 2 to 60 characters" });
    }

    const user = req.user;
    if (user.vendorProfile?.suspended) {
      return res.status(403).json({ error: "Selling is disabled for this account. Contact the store owner." });
    }
    if (!user.roles.includes("vendor")) user.roles.push("vendor");
    // set field by field: a pause or a connected payout account must survive this
    user.set("vendorProfile.storeName", storeName);
    user.set("vendorProfile.since", user.vendorProfile?.since || new Date());
    user.set("vendorProfile.suspended", false);
    await user.save();

    res.status(200).json({ message: "You are now a vendor", user: describeMe(user) });
  } catch (error) {
    console.error("Error in becomeVendor:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
