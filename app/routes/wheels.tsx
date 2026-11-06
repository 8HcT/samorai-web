import type { Route } from './+types/wheels';
import { cssBackground } from '~/lib/images';
import { seoMeta, seoStrings } from '~/lib/seo';
import type { CSSProperties } from 'react';
import { useEffect } from 'react';
import { products } from '~/data/products';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { ProductCard } from '~/components/ProductCard';
import { useT } from '~/i18n/useT';
import { buildPriceBook, lowestPrice } from '~/lib/pricing';
import { loadPricing } from '~/lib/pricing.server';

export function meta(args: Route.MetaArgs) {
  const s = seoStrings(args).wheels;
  return seoMeta(args, { title: s.title, description: s.description });
}

export async function loader() {
  const priceBook = buildPriceBook(await loadPricing(), products);
  return { products, priceBook };
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
      {/* Hero compacto (~30vh) con imagen de fondo (placeholder) + SEO.
          En móvil se oculta: se va directo a las llantas. */}
      <section
        className="page-hero page-hero--ph page-hero--compact page-hero--desktop-only"
        style={{ '--hero-bg': cssBackground('/images/wheels-hero.jpg') } as CSSProperties}
      >
        <div className="container">
          <span className="eyebrow" style={{ color: '#ededed' }}>{w.heroEyebrow}</span>
          <h1>{w.heroTitle}</h1>
          <p className="page-hero__subtitle">{w.heroSubtitle}</p>
        </div>
      </section>

      {/* Con el hero oculto en móvil la página se quedaría sin h1. Este lo
          sustituye solo en ese tamaño: no se ve, pero lo leen los buscadores
          y los lectores de pantalla. */}
      <h1 className="sr-only sr-only--mobile-heading">{w.heroTitle}</h1>

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
