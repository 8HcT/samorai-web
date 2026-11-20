import type { Route } from './+types/wheels';
import { seoMeta, seoStrings } from '~/lib/seo';
import { useEffect } from 'react';
import { products } from '~/data/products';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { ProductCard } from '~/components/ProductCard';
import { useT } from '~/i18n/useT';
import { buildPriceBook, lowestPrice } from '~/lib/pricing';
import { loadPricing } from '~/lib/pricing.server';
import { loadCatalog } from '~/lib/catalog.server';
import { finishKey, finishSummary, type FinishSummary } from '~/lib/catalog';

export function meta(args: Route.MetaArgs) {
  const s = seoStrings(args).wheels;
  return seoMeta(args, { title: s.title, description: s.description });
}

export async function loader() {
  const [pricing, catalog] = await Promise.all([loadPricing(), loadCatalog()]);
  // Estado de cada acabado (visible, etiquetas): sin publicar el stock exacto.
  const finishStates: Record<string, Pick<FinishSummary, 'visible' | 'labels'>> = {};
  for (const product of products.filter((p) => p.status === 'active')) {
    for (const finish of product.finishes) {
      const { visible, labels } = finishSummary(catalog, product, finish.id);
      finishStates[finishKey(product.slug, finish.id)] = { visible, labels };
    }
  }
  return { products, priceBook: buildPriceBook(pricing, products), finishStates };
}

export default function Wheels({ loaderData }: Route.ComponentProps) {
  const w = useT().wheels;

  useEffect(() => {
    trackEvent('wheels_page_viewed', {});
  }, []);

  // Producto activo (Victoria). Cada acabado se presenta como un "modelo";
  // solo los que el panel deja ver.
  const product = loaderData.products.find((p) => p.status === 'active');
  const finishes = product
    ? product.finishes.filter((f) => loaderData.finishStates[finishKey(product.slug, f.id)]?.visible !== false)
    : [];

  return (
    <>
      {/* Sin cabecera con foto: la página va directa a las llantas. El h1
          no se ve, pero lo leen los buscadores y los lectores de pantalla. */}
      <h1 className="sr-only">{w.heroTitle}</h1>

      <div className="section">
      <div className="container">
        {product && finishes.length > 0 ? (
          <div className="product-grid product-grid--models">
            {finishes.map((finish) => (
              <ProductCard
                key={finish.id}
                product={product}
                finish={finish}
                price={lowestPrice(
                  product.variants.filter((v) => v.finishId === finish.id).map((v) => loaderData.priceBook[v.id])
                )}
                labels={loaderData.finishStates[finishKey(product.slug, finish.id)]?.labels ?? []}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state__icon" aria-hidden="true">○</div>
            <h3>{w.emptyTitle}</h3>
            <p>{w.emptyBody}</p>
          </div>
        )}
        </div>
      </div>
    </>
  );
}
