import type { Route } from './+types/cart';
import { seoMeta, seoStrings } from '~/lib/seo';
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
import { PriceTag, PromoBadge } from '~/components/PriceTag';
import { products } from '~/data/products';
import { buildPriceBook } from '~/lib/pricing';
import { loadPricing } from '~/lib/pricing.server';
import { useLocale, useLocalePath, useT } from '~/i18n/useT';
import { fill } from '~/lib/seo';

/** Precios vigentes (y promociones) de todo el catálogo para pintar el carrito. */
export async function loader() {
  return { priceBook: buildPriceBook(await loadPricing(), products) };
}

export function meta(args: Route.MetaArgs) {
  const s = seoStrings(args).cart;
  return seoMeta(args, { title: s.title, description: s.description, noindex: true });
}

const PLACEHOLDER_COLOR_CLASS: Record<string, string> = {
  'Anthracite Grey': 'product-card__image-placeholder--anthracite',
  'Black Metallic': 'product-card__image-placeholder--black',
  'Silver Metallic': 'product-card__image-placeholder--silver',
  'Raw Aluminum': 'product-card__image-placeholder--aluminum',
};

export default function Cart({ loaderData }: Route.ComponentProps) {
  const { lines, setQuantity, remove, ready, count } = useCart();
  const [searchParams] = useSearchParams();
  const errorKey = searchParams.get('error');
  const t = useT();
  const c = t.cart;
  const locale = useLocale();
  const lp = useLocalePath();
  const errorText = errorKey ? c.errors[errorKey] : undefined;

  const resolved = resolveCart(lines, loaderData.priceBook);
  const totalCents = cartTotalCents(resolved);
  // Ahorro por promociones (ya descontado del total).
  const savedCents = resolved.reduce(
    (sum, l) => sum + (l.price ? (l.price.baseCents - l.price.finalCents) * l.quantity : 0),
    0
  );

  useEffect(() => {
    if (ready) trackEvent('cart_viewed', { itemCount: count });
  }, [ready, count]);

  // Antes de hidratar no sabemos el contenido real → evitar parpadeo.
  if (!ready) {
    return (
      <div className="section">
        <div className="container">
          <SectionHeader eyebrow={c.eyebrow} title={c.title} as="h1" />
        </div>
      </div>
    );
  }

  if (resolved.length === 0) {
    return (
      <div className="section">
        <div className="container">
          {errorText && <p className="cart-error" role="alert">{errorText}</p>}
          <div className="empty-state">
            <div className="empty-state__icon" aria-hidden="true">○</div>
            <h3>{c.emptyTitle}</h3>
            <p>{c.emptyBody}</p>
            <Button href={lp('/the-wheels')} variant="primary">{c.browse}</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="container">
        <SectionHeader eyebrow={c.eyebrow} title={c.title} as="h1" />

        {errorText && <p className="cart-error" role="alert">{errorText}</p>}

        <div className="cart-layout">
          {/* Items */}
          <div>
            {resolved.map((line) => {
              const { variant, product } = line;
              const finishName = t.finishNames[variant.finishId] ?? getFinish(product, variant.finishId)?.name ?? variant.color;
              const spec = `${formatSize(variant.diameter, variant.width, locale)} · ${formatEt(variant.et)} · ${variant.pcd}`;
              return (
                <div key={variant.id} className="cart-item">
                  <div className="cart-item__image">
                    <div
                      className={`product-card__image-placeholder ${PLACEHOLDER_COLOR_CLASS[variant.color] ?? 'product-card__image-placeholder--anthracite'}`}
                      style={{ width: '100%', height: '100%' }}
                      role="img"
                      aria-label={fill(c.imageAria, { name: product.name, finish: finishName })}
                    />
                  </div>

                  <div>
                    <p className="cart-item__name">{product.name}</p>
                    <p className="cart-item__spec">{finishName}</p>
                    <p className="cart-item__spec">{spec}</p>
                    <p className="cart-item__spec">
                      {c.unitPrice} <PriceTag price={line.price} wasLabel={t.product.was} /> · {c.vatIncluded}
                    </p>
                    {line.price?.promotion && (
                      <p className="cart-item__spec">
                        <PromoBadge promotion={line.price.promotion} />
                      </p>
                    )}
                    <div className="cart-item__qty" aria-label={c.quantity}>
                      <button
                        className="cart-item__qty-btn"
                        aria-label={c.decrease}
                        onClick={() => setQuantity(variant.id, line.quantity - 1)}
                      >
                        −
                      </button>
                      <span className="cart-item__qty-count" aria-live="polite">
                        {line.quantity}
                      </span>
                      <button
                        className="cart-item__qty-btn"
                        aria-label={c.increase}
                        onClick={() => setQuantity(variant.id, line.quantity + 1)}
                      >
                        +
                      </button>
                      <button
                        className="cart-item__remove"
                        onClick={() => remove(variant.id)}
                        aria-label={fill(c.removeAria, { name: product.name })}
                      >
                        {c.remove}
                      </button>
                    </div>
                  </div>

                  <div className="cart-item__price">
                    <PriceTag price={line.price} quantity={line.quantity} wasLabel={t.product.was} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="cart-summary">
            <h2 className="cart-summary__title">{c.summary}</h2>
            <div className="cart-summary__row">
              <span>{c.subtotal}</span>
              <span>{formatPrice(totalCents)}</span>
            </div>
            {savedCents > 0 && (
              <div className="cart-summary__row">
                <span>{c.saved}</span>
                <span className="price-now">−{formatPrice(savedCents)}</span>
              </div>
            )}
            <div className="cart-summary__row">
              <span>{c.shipping}</span>
              <span>{c.shippingFree}</span>
            </div>
            <div className="cart-summary__total">
              <span>{c.total}</span>
              <span>{formatPrice(totalCents)}</span>
            </div>
            <p className="caption" style={{ marginTop: 'var(--space-2)' }}>
              {c.taxNote}
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
                {c.checkout}
              </Button>
            </form>

            <div className="cart-notice">
              {c.notice}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
