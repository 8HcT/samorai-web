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
import { CartSkeletonBody } from '~/components/PageSkeleton';
import { Spinner } from '~/components/ui/Spinner';
import { loadCatalog } from '~/lib/catalog.server';
import { lineProblem, publicVariantState, type PublicVariantState } from '~/lib/catalog';

/**
 * Precios vigentes (y promociones) y disponibilidad de cada referencia para
 * pintar el carrito. Tras un aviso de stock del pago, se lee sin caché.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const fresh = new URL(request.url).searchParams.get('error') === 'stock';
  const [pricing, catalog] = await Promise.all([loadPricing(), loadCatalog({ fresh })]);
  const availability: Record<string, PublicVariantState> = {};
  for (const p of products) for (const v of p.variants) availability[v.id] = publicVariantState(catalog, p.slug, v);
  return { priceBook: buildPriceBook(pricing, products), availability };
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
  // Líneas agotadas o con más unidades de las que quedan: no se puede pagar.
  const problems = new Map(resolved.map((l) => [l.variant.id, lineProblem(loaderData.availability[l.variant.id], l.quantity)]));
  const blocked = [...problems.values()].some(Boolean);
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
          <div role="status" aria-label={c.loadingCart}>
            <CartSkeletonBody />
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
              const problem = problems.get(variant.id) ?? null;
              const maxQty = loaderData.availability[variant.id]?.left ?? null;
              return (
                <div key={variant.id} className={`cart-item${problem ? ' cart-item--problem' : ''}`}>
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
                    {problem && (
                      <p className="cart-item__problem" role="alert">
                        {problem.kind === 'unavailable'
                          ? problem.reason === 'sold_out'
                            ? c.lineSoldOut
                            : c.lineUnavailable
                          : fill(c.lineOnlyLeft, { n: String(problem.left) })}
                        {problem.kind === 'too_many' && problem.left > 0 && (
                          <button type="button" className="cart-item__fix" onClick={() => setQuantity(variant.id, problem.left)}>
                            {fill(c.adjustTo, { n: String(problem.left) })}
                          </button>
                        )}
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
                        disabled={maxQty != null && line.quantity >= maxQty}
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
              onSubmit={(e) => {
                if (blocked) {
                  e.preventDefault();
                  return;
                }
                trackEvent('checkout_started', { itemCount: count });
                setLeaving(true);
              }}
            >
              <input type="hidden" name="cart" value={JSON.stringify(lines)} />
              <input type="hidden" name="locale" value={locale} />
              {blocked && <p className="cart-blocked" role="status">{c.fixLines}</p>}
              <button
                type="submit"
                className="btn btn-primary btn-lg w-full cart-checkout"
                disabled={leaving || blocked}
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
