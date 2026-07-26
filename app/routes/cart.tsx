import type { Route } from './+types/cart';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useCart } from '~/lib/cart/CartContext';
import { resolveCart, cartTotalCents } from '~/lib/cart';
import { getFinish } from '~/data/products';
import { formatPrice } from '~/lib/money';
import { formatSize, formatEt } from '~/lib/format';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { Button } from '~/components/Button';
import { SectionHeader } from '~/components/SectionHeader';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Carrito | SAMORAI' },
    { name: 'description', content: 'Your SAMORAI wheel selection.' },
  ];
}

const PLACEHOLDER_COLOR_CLASS: Record<string, string> = {
  'Anthracite Grey': 'product-card__image-placeholder--anthracite',
  'Black Metallic': 'product-card__image-placeholder--black',
  'Silver Metallic': 'product-card__image-placeholder--silver',
  'Raw Aluminum': 'product-card__image-placeholder--aluminum',
};

const CHECKOUT_ERRORS: Record<string, string> = {
  empty: 'Tu carrito está vacío.',
  price: 'Algún artículo no tiene precio configurado todavía. Inténtalo más tarde.',
  stripe: 'No se pudo iniciar el pago. Revisa la configuración de Stripe e inténtalo de nuevo.',
};

export default function Cart() {
  const { lines, setQuantity, remove, ready, count } = useCart();
  const [searchParams] = useSearchParams();
  const errorKey = searchParams.get('error');

  const resolved = resolveCart(lines);
  const totalCents = cartTotalCents(resolved);

  useEffect(() => {
    if (ready) trackEvent('cart_viewed', { itemCount: count });
  }, [ready, count]);

  // Antes de hidratar no sabemos el contenido real → evitar parpadeo.
  if (!ready) {
    return (
      <div className="section">
        <div className="container">
          <SectionHeader eyebrow="Your Selection" title="Cart" />
        </div>
      </div>
    );
  }

  if (resolved.length === 0) {
    return (
      <div className="section">
        <div className="container">
          {errorKey && CHECKOUT_ERRORS[errorKey] && (
            <p className="cart-error" role="alert">{CHECKOUT_ERRORS[errorKey]}</p>
          )}
          <div className="empty-state">
            <div className="empty-state__icon" aria-hidden="true">○</div>
            <h3>Your cart is empty</h3>
            <p>Browse the Victoria range to find your perfect set.</p>
            <Button href="/the-wheels" variant="primary">Browse Wheels</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="container">
        <SectionHeader eyebrow="Your Selection" title="Cart" />

        {errorKey && CHECKOUT_ERRORS[errorKey] && (
          <p className="cart-error" role="alert">{CHECKOUT_ERRORS[errorKey]}</p>
        )}

        <div className="cart-layout">
          {/* Items */}
          <div>
            {resolved.map((line) => {
              const { variant, product } = line;
              const finishName = getFinish(product, variant.finishId)?.name ?? variant.color;
              const spec = `${formatSize(variant.diameter, variant.width)} · ${formatEt(variant.et)} · ${variant.pcd}`;
              return (
                <div key={variant.id} className="cart-item">
                  <div className="cart-item__image">
                    <div
                      className={`product-card__image-placeholder ${PLACEHOLDER_COLOR_CLASS[variant.color] ?? 'product-card__image-placeholder--anthracite'}`}
                      style={{ width: '100%', height: '100%' }}
                      role="img"
                      aria-label={`${product.name} in ${variant.color}`}
                    />
                  </div>

                  <div>
                    <p className="cart-item__name">{product.name}</p>
                    <p className="cart-item__spec">{finishName}</p>
                    <p className="cart-item__spec">{spec}</p>
                    <p className="cart-item__spec">
                      Precio unitario: {formatPrice(line.unitPriceCents)} · IVA incluido
                    </p>
                    <div className="cart-item__qty" aria-label="Cantidad">
                      <button
                        className="cart-item__qty-btn"
                        aria-label="Decrease quantity"
                        onClick={() => setQuantity(variant.id, line.quantity - 1)}
                      >
                        −
                      </button>
                      <span className="cart-item__qty-count" aria-live="polite">
                        {line.quantity}
                      </span>
                      <button
                        className="cart-item__qty-btn"
                        aria-label="Increase quantity"
                        onClick={() => setQuantity(variant.id, line.quantity + 1)}
                      >
                        +
                      </button>
                      <button
                        className="cart-item__remove"
                        onClick={() => remove(variant.id)}
                        aria-label={`Remove ${product.name}`}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>

                  <div className="cart-item__price">{formatPrice(line.lineTotalCents)}</div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="cart-summary">
            <h2 className="cart-summary__title">Order Summary</h2>
            <div className="cart-summary__row">
              <span>Subtotal (IVA incluido)</span>
              <span>{formatPrice(totalCents)}</span>
            </div>
            <div className="cart-summary__row">
              <span>Envío</span>
              <span>Calculado en el checkout</span>
            </div>
            <div className="cart-summary__total">
              <span>Total</span>
              <span>{formatPrice(totalCents)}</span>
            </div>
            <p className="caption" style={{ marginTop: 'var(--space-2)' }}>
              IVA incluido. No se añaden impuestos adicionales.
            </p>

            {/* POST nativo al resource route → crea la sesión y redirige a Stripe */}
            <form method="post" action="/api/checkout">
              <input type="hidden" name="cart" value={JSON.stringify(lines)} />
              <Button
                type="submit"
                variant="primary"
                size="large"
                className="w-full"
                onClick={() => trackEvent('checkout_started', { itemCount: count })}
              >
                Proceed to Checkout
              </Button>
            </form>

            <div className="cart-notice">
              Pago seguro con Stripe · IVA incluido · Envío calculado en el checkout.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
