// Single source of truth for order pricing (mobile/app/(tabs)/cart.tsx mirrors these numbers)
export const SHIPPING_FEE = 10;
export const FREE_SHIPPING_OVER = 100; // subtotal at or above this ships free
export const TAX_RATE = 0.08;

export function computePricing(subtotal) {
  const shipping = subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FEE;
  const tax = subtotal * TAX_RATE;
  return { subtotal, shipping, tax, total: subtotal + shipping + tax };
}
