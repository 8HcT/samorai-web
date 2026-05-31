import type { Route } from './+types/cart';
import { useEffect } from 'react';
import { MOCK_CART_ITEMS } from '~/lib/cart/index';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { Button } from '~/components/Button';
import { SectionHeader } from '~/components/SectionHeader';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Cart — SAMORAI Wheels' },
    { name: 'description', content: 'Your SAMORAI wheel selection.' },
  ];
}

const PLACEHOLDER_COLOR_CLASS: Record<string, string> = {
  'Anthracite Grey': 'product-card__image-placeholder--anthracite',
  'Black Metallic': 'product-card__image-placeholder--black',
  'Silver Metallic': 'product-card__image-placeholder--silver',
  'Raw Aluminum': 'product-card__image-placeholder--aluminum',
};

export default function Cart() {
  const items = MOCK_CART_ITEMS;

  useEffect(() => {
    trackEvent('cart_viewed', { itemCount: items.length });
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div className="section">
        <div className="container">
          <div className="empty-state">
            <div className="empty-state__icon" aria-hidden="true">○</div>
            <h3>Your cart is empty</h3>
            <p>Browse the Victoria range to find your perfect set.</p>
            <Button href="/wheels" variant="primary">Browse Wheels</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="container">
        <SectionHeader
          eyebrow="Your Selection"
          title="Cart"
        />

        <div className="cart-layout">
          {/* Items */}
          <div>
            {items.map((item) => (
              <div key={item.variantId} className="cart-item">
                <div className="cart-item__image">
                  <div
                    className={`product-card__image-placeholder ${PLACEHOLDER_COLOR_CLASS[item.color] ?? 'product-card__image-placeholder--anthracite'}`}
                    style={{ width: '100%', height: '100%' }}
                    role="img"
                    aria-label={`${item.name} in ${item.color}`}
                  />
                </div>

                <div>
                  <p className="cart-item__name">{item.name}</p>
                  <p className="cart-item__spec">{item.spec}</p>
                  <p className="cart-item__spec">{item.color}</p>
                  <div className="cart-item__qty" aria-label="Quantity">
                    <button
                      className="cart-item__qty-btn"
                      aria-label="Decrease quantity"
                      disabled
                    >
                      −
                    </button>
                    <span className="cart-item__qty-count" aria-live="polite">
                      {item.quantity}
                    </span>
                    <button
                      className="cart-item__qty-btn"
                      aria-label="Increase quantity"
                      disabled
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="cart-item__price">{item.priceLabel}</div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="cart-summary">
            <h2 className="cart-summary__title">Order Summary</h2>
            <div className="cart-summary__row">
              <span>Subtotal</span>
              <span>Price on request</span>
            </div>
            <div className="cart-summary__row">
              <span>Shipping</span>
              <span>Calculated at checkout</span>
            </div>
            <div className="cart-summary__row">
              <span>Hub rings</span>
              <span>—</span>
            </div>
            <div className="cart-summary__total">
              <span>Total</span>
              <span>Price on request</span>
            </div>

            <Button
              variant="primary"
              size="large"
              className="w-full"
              disabled
              onClick={() => trackEvent('checkout_started', { itemCount: items.length })}
            >
              Proceed to Checkout
            </Button>

            <div className="cart-notice">
              Checkout not yet active — submit to register interest.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
