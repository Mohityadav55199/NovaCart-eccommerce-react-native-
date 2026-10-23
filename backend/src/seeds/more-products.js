// Adds more demo products without touching existing ones (safe to re-run, unlike `seed:products`).
// Products are matched by name, so edits made in the admin are never overwritten.
import mongoose from "mongoose";
import { Product } from "../models/product.model.js";
import { ENV } from "../config/env.js";

const img = (id) => `https://images.unsplash.com/photo-${id}?w=500`;

const products = [
  // Electronics
  { name: "UltraBook Pro 14\" Laptop", description: "Lightweight 14-inch laptop with a sharp display, all-day battery and fast SSD storage. Built for work, study and travel.", price: 899.99, stock: 15, category: "Electronics", images: [img("1496181133206-80ce9b88a853")], averageRating: 4.6, totalReviews: 94 },
  { name: "Mechanical Keyboard RGB", description: "Hot-swappable mechanical keyboard with tactile switches, per-key RGB lighting and a sturdy aluminium frame.", price: 89.99, stock: 60, category: "Electronics", images: [img("1587829741301-dc798b83add3")], averageRating: 4.5, totalReviews: 210 },
  { name: "Mirrorless Camera Kit", description: "24MP mirrorless camera with 4K video, fast autofocus and a versatile kit lens. Great for beginners and creators.", price: 649.0, stock: 12, category: "Electronics", images: [img("1516035069371-29a1b244cc32")], averageRating: 4.7, totalReviews: 67 },
  { name: "Smartphone X 128GB", description: "6.5-inch OLED display, dual cameras, 5G and a two-day battery. Unlocked and ready to use.", price: 699.0, stock: 30, category: "Electronics", images: [img("1511707171634-5f897ff02aa9")], averageRating: 4.4, totalReviews: 318 },
  { name: "True Wireless Earbuds", description: "Compact earbuds with active noise cancellation, 24-hour battery with the case and a secure, comfortable fit.", price: 59.99, stock: 80, category: "Electronics", images: [img("1590658268037-6bf12165a8df")], averageRating: 4.3, totalReviews: 442 },
  { name: "27\" 4K Monitor", description: "Colour-accurate 4K IPS monitor with thin bezels, USB-C charging and an adjustable stand.", price: 329.99, stock: 18, category: "Electronics", images: [img("1527443224154-c4a3942d3acf")], averageRating: 4.6, totalReviews: 128 },

  // Fashion
  { name: "Urban Running Sneakers", description: "Breathable mesh sneakers with a cushioned sole. Equally at home on the track or on the street.", price: 84.99, stock: 70, category: "Fashion", images: [img("1542291026-7eec264c27ff")], averageRating: 4.5, totalReviews: 276 },
  { name: "Essential Cotton T-Shirt", description: "Soft, pre-shrunk 100% cotton tee with a relaxed fit. A wardrobe staple in a range of colours.", price: 19.99, stock: 200, category: "Fashion", images: [img("1521572163474-6864f9cf17ab")], averageRating: 4.2, totalReviews: 530 },
  { name: "Cozy Pullover Hoodie", description: "Heavyweight fleece hoodie with a roomy hood and kangaroo pocket. Warm without the bulk.", price: 49.99, stock: 90, category: "Fashion", images: [img("1556821840-3a63f95609a7")], averageRating: 4.6, totalReviews: 188 },

  // Accessories
  { name: "Classic Analog Watch", description: "Minimalist stainless-steel watch with sapphire-coated glass and water resistance to 50 metres. Currently sold out, back soon.", price: 129.0, stock: 0, category: "Accessories", images: [img("1524592094714-0f0654e20314")], averageRating: 4.8, totalReviews: 152 },
  { name: "Aviator Sunglasses", description: "Polarised UV400 lenses in a lightweight metal frame. Includes a hard case and cleaning cloth.", price: 39.99, stock: 100, category: "Accessories", images: [img("1572635196237-14b3f281503f")], averageRating: 4.3, totalReviews: 97 },
  { name: "Urban Commuter Backpack", description: "Water-resistant 22L backpack with a padded laptop sleeve, hidden anti-theft pocket and USB charging port.", price: 59.99, stock: 55, category: "Accessories", images: [img("1553062407-98eeb64c6a62")], averageRating: 4.6, totalReviews: 203 },
  { name: "Slim Leather Wallet", description: "Full-grain leather bifold with RFID protection, six card slots and a bill compartment.", price: 34.99, stock: 120, category: "Accessories", images: [img("1627123424574-724758594e93")], averageRating: 4.4, totalReviews: 166 },
  { name: "Canvas Baseball Cap", description: "Washed cotton-canvas cap with an adjustable strap and a curved brim.", price: 17.99, stock: 150, category: "Accessories", images: [img("1521369909029-2afed882baee")], averageRating: 4.1, totalReviews: 74 },

  // Sports
  { name: "Non-Slip Yoga Mat", description: "6mm cushioned mat with a grippy texture on both sides. Includes a carrying strap.", price: 29.99, stock: 85, category: "Sports", images: [img("1601925260368-ae2f83cf8b7f")], averageRating: 4.5, totalReviews: 231 },
  { name: "Hex Dumbbell Set (2 x 10kg)", description: "Rubber-coated hex dumbbells that will not roll away. Ideal for strength training at home.", price: 119.99, stock: 25, category: "Sports", images: [img("1534438327276-14e5300c3a48")], averageRating: 4.7, totalReviews: 119 },
  { name: "City Commuter Bicycle", description: "Lightweight 7-speed city bike with fenders, a rear rack and comfortable upright geometry.", price: 459.0, stock: 8, category: "Sports", images: [img("1485965120184-e220f721d03e")], averageRating: 4.5, totalReviews: 58 },
  { name: "Pro Indoor/Outdoor Basketball", description: "Durable composite-leather basketball with deep channels for a better grip. Official size and weight.", price: 24.99, stock: 110, category: "Sports", images: [img("1546519638-68e109498ffc")], averageRating: 4.4, totalReviews: 142 },
  { name: "Insulated Water Bottle 750ml", description: "Double-wall stainless steel bottle that keeps drinks cold for 24 hours or hot for 12.", price: 22.99, stock: 140, category: "Sports", images: [img("1602143407151-7111542de6e8")], averageRating: 4.6, totalReviews: 309 },

  // Books
  { name: "The Reading Room (Novel)", description: "A beautifully told story of friendship and second chances. A bestselling paperback.", price: 14.99, stock: 90, category: "Books", images: [img("1544947950-fa07a98d237f")], averageRating: 4.4, totalReviews: 87 },
  { name: "Modern Web Development Handbook", description: "A practical guide to building fast, accessible websites with today's tools and frameworks.", price: 39.99, stock: 45, category: "Books", images: [img("1512820790803-83ca734da794")], averageRating: 4.7, totalReviews: 63 },
  { name: "Mindful Living Journal", description: "A guided daily journal for gratitude, goals and reflection. Lay-flat binding and thick paper.", price: 16.99, stock: 75, category: "Books", images: [img("1495446815901-a7297e633e8d")], averageRating: 4.5, totalReviews: 51 },
  { name: "World History Collection", description: "An illustrated overview of the great civilisations and turning points in human history.", price: 54.99, stock: 30, category: "Books", images: [img("1481627834876-b7833e8f5570")], averageRating: 4.6, totalReviews: 39 },
];

try {
  await mongoose.connect(ENV.DB_URL);

  // $setOnInsert: only creates missing products, never overwrites existing ones
  const result = await Product.bulkWrite(
    products.map((product) => ({
      updateOne: { filter: { name: product.name }, update: { $setOnInsert: product }, upsert: true },
    }))
  );

  console.log(`Added ${result.upsertedCount} new products, ${products.length - result.upsertedCount} already existed`);
  console.log(`Total products in the database: ${await Product.countDocuments()}`);
} catch (error) {
  console.error("Failed to add products:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
