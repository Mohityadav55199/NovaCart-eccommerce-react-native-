// Single source of truth for order pricing (mobile/app/(tabs)/cart.tsx mirrors these numbers)
export const SHIPPING_FEE = 10;
export const FREE_SHIPPING_OVER = 100; // subtotal at or above this ships free
export const TAX_RATE = 0.08;

const toCents = (dollars) => Math.round(dollars * 100);
const fromCents = (cents) => cents / 100;

// Works in whole cents so floating point error (0.1 + 0.2) never leaks into a stored total or a Stripe amount
export function computePricing(subtotal) {
  const subtotalCents = toCents(subtotal);
  const shippingCents = subtotalCents >= toCents(FREE_SHIPPING_OVER) ? 0 : toCents(SHIPPING_FEE);
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  return {
    subtotal: fromCents(subtotalCents),
    shipping: fromCents(shippingCents),
    tax: fromCents(taxCents),
    total: fromCents(subtotalCents + shippingCents + taxCents),
  };
}
