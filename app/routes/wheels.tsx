import type { Route } from './+types/wheels';
import { seoMeta, seoStrings } from '~/lib/seo';
import { useEffect } from 'react';
import { products } from '~/data/products';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { ProductCard } from '~/components/ProductCard';
import { useT } from '~/i18n/useT';
import { buildPriceBook, lowestPrice } from '~/lib/pricing';
import { loadPricing } from '~/lib/pricing.server';
import { loadLabels } from '~/lib/labels.server';
import { labelKey } from '~/lib/labels';

export function meta(args: Route.MetaArgs) {
  const s = seoStrings(args).wheels;
  return seoMeta(args, { title: s.title, description: s.description });
}

export async function loader() {
  const [pricing, labels] = await Promise.all([loadPricing(), loadLabels()]);
  return { products, priceBook: buildPriceBook(pricing, products), labels: labels.labels };
}

export default function Wheels({ loaderData }: Route.ComponentProps) {
  const w = useT().wheels;

  useEffect(() => {
    trackEvent('wheels_page_viewed', {});
  }, []);

  // Producto activo (Victoria). Cada acabado se presenta como un "modelo".
  const product = loaderData.products.find((p) => p.status === 'active');

  return (
    <>
      {/* Sin cabecera con foto: la página va directa a las llantas. El h1
          no se ve, pero lo leen los buscadores y los lectores de pantalla. */}
      <h1 className="sr-only">{w.heroTitle}</h1>

      <div className="section">
      <div className="container">
        {product ? (
          <div className="product-grid product-grid--models">
            {product.finishes.map((finish) => (
              <ProductCard
                key={finish.id}
                product={product}
                finish={finish}
                price={lowestPrice(
                  product.variants.filter((v) => v.finishId === finish.id).map((v) => loaderData.priceBook[v.id])
                )}
                label={loaderData.labels[labelKey(product.slug, finish.id)]}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state__icon" aria-hidden="true">○</div>
            <h3>Nothing here yet</h3>
            <p>No hay productos disponibles todavía.</p>
          </div>
        )}
        </div>
      </div>
    </>
  );
}
