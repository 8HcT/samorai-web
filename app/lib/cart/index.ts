/**
 * Cart module — not yet implemented.
 *
 * Future shape:
 *   - CartItem: { productId, variantId, quantity, priceLabel }
 *   - useCart() hook backed by React context + localStorage or Supabase
 *   - addItem / removeItem / updateQuantity / clearCart
 *   - Persisted session via Supabase or anonymous local cart
 */
export type CartItem = {
  productId: string;
  variantId: string;
  quantity: number;
  priceLabel: string;
  name: string;
  spec: string;
  color: string;
};

export const MOCK_CART_ITEMS: CartItem[] = [
  {
    productId: 'victoria-001',
    variantId: 'vic-18x9-et35-ag',
    quantity: 4,
    priceLabel: 'Price on request',
    name: 'SAMORAI Victoria',
    spec: '18×9 ET35 5×120 CB72.6',
    color: 'Anthracite Grey',
  },
];
