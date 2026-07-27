import type { Route } from './+types/wheels';
import type { CSSProperties } from 'react';
import { useEffect } from 'react';
import { products } from '~/data/products';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { ProductCard } from '~/components/ProductCard';
import { useT } from '~/i18n/useT';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'The Wheels | SAMORAI' },
    { name: 'description', content: 'Llantas de aleación SAMORAI Victoria: 18″, PCD 5×120, buje 72,6 mm. Tres acabados (Antracita Grey, Black Metallic, Silver Metallic). Elige medida y ET para tu vehículo.' },
  ];
}

export function loader() {
  return { products };
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
      {/* Hero compacto (~30vh) con imagen de fondo (placeholder) + SEO */}
      <section
        className="page-hero page-hero--ph page-hero--compact"
        style={{ '--hero-bg': "url('/images/wheels-hero.jpg')" } as CSSProperties}
      >
        <div className="container">
          <span className="eyebrow" style={{ color: '#ededed' }}>{w.heroEyebrow}</span>
          <h1>{w.heroTitle}</h1>
          <p className="page-hero__subtitle">{w.heroSubtitle}</p>
        </div>
      </section>

      <div className="section">
      <div className="container">
        {product ? (
          <div className="product-grid product-grid--models">
            {product.finishes.map((finish) => (
              <ProductCard key={finish.id} product={product} finish={finish} />
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
