import type { Route } from './+types/cart';
import { seoMeta, seoStrings } from '~/lib/seo';
import { useEffect, useState } from 'react';
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
import { useLocale, useT } from '~/i18n/useT';
import { fill } from '~/lib/seo';
import { ProductMedia } from '~/components/ProductMedia';
import { Skeleton, SkeletonText } from '~/components/ui/Skeleton';
import { Spinner } from '~/components/ui/Spinner';

/** Precios vigentes (y promociones) de todo el catálogo para pintar el carrito. */
export async function loader() {
  return { priceBook: buildPriceBook(await loadPricing(), products) };
}

export function meta(args: Route.MetaArgs) {
  const s = seoStrings(args).cart;
  return seoMeta(args, { title: s.title, description: s.description, noindex: true });
}

export default function Cart({ loaderData }: Route.ComponentProps) {
  const { lines, setQuantity, remove, ready, count } = useCart();
  const [searchParams] = useSearchParams();
  const errorKey = searchParams.get('error');
  const t = useT();
  const c = t.cart;
  const locale = useLocale();
  const errorText = errorKey ? c.errors[errorKey] : undefined;
  // Al pulsar «Pagar» se sale hacia Stripe: botón en espera y sin dobles envíos.
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    // Volver con «atrás» desde Stripe saca la página de la caché: reactivar el botón.
    const reset = (e: PageTransitionEvent) => e.persisted && setLeaving(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

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

  // Antes de hidratar no sabemos el contenido real (vive en el navegador):
  // esqueleto con la forma del carrito en vez de un hueco o un parpadeo.
  if (!ready) {
    return (
      <div className="section">
        <div className="container">
          <SectionHeader eyebrow={c.eyebrow} title={c.title} as="h1" />
          <div className="cart-layout" role="status" aria-label={c.loadingCart}>
            <div>
              {[0, 1].map((i) => (
                <div key={i} className="cart-item" aria-hidden="true">
                  <div className="cart-item__image"><Skeleton width="100%" height="100%" /></div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <Skeleton width="45%" height={18} />
                    <SkeletonText lines={2} />
                    <Skeleton width={120} height={36} />
                  </div>
                  <div className="cart-item__price"><Skeleton width={80} height={20} /></div>
                </div>
              ))}
            </div>
            <div className="cart-summary" aria-hidden="true">
              <Skeleton width="50%" height={20} />
              <div style={{ display: 'grid', gap: 14, margin: '24px 0' }}>
                <SkeletonText lines={3} />
              </div>
              <Skeleton width="100%" height={52} />
            </div>
          </div>
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
            <Button href="/the-wheels" variant="primary">{c.browse}</Button>
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
                    <ProductMedia
                      color={variant.color}
                      src={getFinish(product, variant.finishId)?.images[0]}
                      alt={fill(c.imageAria, { name: product.name, finish: finishName })}
                      sizes="120px"
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
            <form
              method="post"
              action="/api/checkout"
              onSubmit={() => {
                trackEvent('checkout_started', { itemCount: count });
                setLeaving(true);
              }}
            >
              <input type="hidden" name="cart" value={JSON.stringify(lines)} />
              <input type="hidden" name="locale" value={locale} />
              <button
                type="submit"
                className="btn btn-primary btn-lg w-full cart-checkout"
                disabled={leaving}
                aria-busy={leaving || undefined}
              >
                {leaving && <Spinner size={16} />}
                {leaving ? c.redirecting : c.checkout}
              </button>
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
