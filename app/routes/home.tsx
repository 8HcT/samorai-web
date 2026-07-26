import type { Route } from './+types/home';
import type { CSSProperties } from 'react';
import { useRef } from 'react';
import { Link } from 'react-router';
import { getFeaturedProducts } from '~/data/products';
import { SectionHeader } from '~/components/SectionHeader';
import { ProductCard } from '~/components/ProductCard';
import { MediaPlaceholder } from '~/components/MediaPlaceholder';
import { Button } from '~/components/Button';
import { useT } from '~/i18n/useT';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'SAMORAI | Precision Wheels' },
    { name: 'description', content: 'SAMORAI Victoria — premium alloy wheels. Precision cast, performance driven. Available in 18" with 5×120 PCD.' },
  ];
}

export default function Home() {
  const featured = getFeaturedProducts();
  const victoria = featured[0];
  const t = useT();
  const h = t.home;

  return (
    <>
      {/* Hero — placeholder de imagen de fondo: cuando exista el archivo se
          muestra automáticamente; hasta entonces se ve el patrón rayado. */}
      <section
        className="hero hero--ph"
        aria-label="Hero"
        style={{ '--hero-bg': "url('/images/home-hero.jpg')" } as CSSProperties}
      >
        <div className="hero__bg" aria-hidden="true" />

        {/* large decorative wheel */}
        <div className="hero__wheel-bg" aria-hidden="true">
          <div className="hero__wheel-bg-circle">
            <div className="hero__wheel-hub" />
          </div>
        </div>

        <div className="container hero__content">
          <div className="hero__label" aria-hidden="true">
            <span className="hero__label-line" />
            <span className="eyebrow" style={{ margin: 0 }}>{h.heroEyebrow}</span>
          </div>

          <h1 className="hero__model-name" aria-label="Victoria by SAMORAI">
            Victoria
          </h1>

          <p className="hero__tagline">
            {h.heroTagline1}<br />
            {h.heroTagline2}
          </p>

          <div className="hero__cta">
            <Button href="/the-wheels" variant="primary" size="large">
              {h.heroCtaPrimary}
            </Button>
            <Button href="/the-dynasty" variant="ghost" size="large">
              {h.heroCtaSecondary}
            </Button>
          </div>
        </div>
      </section>

      {/* Featured product */}
      <section className="section section--elevated" aria-label="Featured wheel">
        <div className="container">
          <SectionHeader
            eyebrow={h.featuredEyebrow}
            title={h.featuredTitle}
            subtitle={h.featuredSubtitle}
          />
          {victoria && (
            <div className="product-grid product-grid--models">
              {victoria.finishes.map((finish) => (
                <ProductCard key={finish.id} product={victoria} finish={finish} />
              ))}
            </div>
          )}
          <div style={{ marginTop: 'var(--space-10)', textAlign: 'center' }}>
            <Button href="/the-wheels" variant="secondary">
              {h.featuredBtn}
            </Button>
          </div>
        </div>
      </section>

      {/* Hub rings feature — OCULTO: los hub rings aún no están a la venta.
          Para reactivar, descomenta esta sección.
      <section className="section" aria-label="Hub rings">
        <div className="container">
          <div className="hub-rings-section">
            <div>
              <span className="eyebrow">{h.hubEyebrow}</span>
              <h2>{h.hubTitle}</h2>
              <p style={{ marginBottom: 'var(--space-6)', marginTop: 'var(--space-4)' }}>
                {h.hubDesc1}
              </p>
              <p style={{ marginBottom: 'var(--space-8)' }}>
                {h.hubDesc2}
              </p>
              <Button href="/contacto" variant="primary">
                {h.hubBtn}
              </Button>
            </div>

            <div className="hub-rings-visual" aria-hidden="true">
              <div className="hub-rings-diagram">
                <div className="hub-rings-diagram__ring hub-rings-diagram__ring--outer" />
                <div className="hub-rings-diagram__ring hub-rings-diagram__ring--hub">
                  <span className="hub-rings-diagram__label">CB 72.6mm</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      */}

      {/* Brand values */}
      <section className="section section--bordered" aria-label="Why SAMORAI">
        <div className="container">
          <SectionHeader
            eyebrow={h.valuesEyebrow}
            title={h.valuesTitle}
            center
          />
          <div className="brand-values">
            <div className="brand-value">
              <p className="brand-value__number">01</p>
              <h3 className="brand-value__title">{h.value1Title}</h3>
              <p className="brand-value__text">{h.value1Desc}</p>
            </div>
            <div className="brand-value">
              <p className="brand-value__number">02</p>
              <h3 className="brand-value__title">{h.value2Title}</h3>
              <p className="brand-value__text">{h.value2Desc}</p>
            </div>
            <div className="brand-value">
              <p className="brand-value__number">03</p>
              <h3 className="brand-value__title">{h.value3Title}</h3>
              <p className="brand-value__text">{h.value3Desc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Brand attitude — manifiesto (Home §4 · componente 20) */}
      <section className="section section--elevated" aria-label="Brand attitude">
        <div className="container">
          <div className="manifesto">
            <span className="script">{h.manifestoScript}</span>
            <p>{h.manifestoBody}</p>
            <span className="by">
              <Link to="/the-dynasty" style={{ color: 'inherit' }}>{h.manifestoBy}</Link>
            </span>
          </div>
        </div>
      </section>

      {/* Galería / carrusel de imágenes (placeholders) */}
      <HomeGallery />
    </>
  );
}

/** Elementos del carrusel. Sustituye cada MediaPlaceholder por su <img> real
 *  (archivos en public/images/). El `caption` es la guía editable de cada foto. */
const GALLERY_ITEMS = [
  { file: '/images/home-gallery-1.jpg', caption: '[Pie de foto — describe esta imagen]' },
  { file: '/images/home-gallery-2.jpg', caption: '[Pie de foto — describe esta imagen]' },
  { file: '/images/home-gallery-3.jpg', caption: '[Pie de foto — describe esta imagen]' },
  { file: '/images/home-gallery-4.jpg', caption: '[Pie de foto — describe esta imagen]' },
  { file: '/images/home-gallery-5.jpg', caption: '[Pie de foto — describe esta imagen]' },
];

function HomeGallery() {
  const trackRef = useRef<HTMLDivElement>(null);

  function scrollBy(dir: number) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector('.carousel__item');
    const step = card ? card.getBoundingClientRect().width + 16 : track.clientWidth * 0.8;
    track.scrollBy({ left: dir * step, behavior: 'smooth' });
  }

  return (
    <section className="section section--elevated" aria-label="Galería">
      <div className="container">
        <div className="carousel-head">
          <div>
            <span className="eyebrow">Galería</span>
            <h2>El mundo SAMORAI</h2>
          </div>
          <div className="carousel-nav" aria-hidden="true">
            <button type="button" aria-label="Anterior" onClick={() => scrollBy(-1)}>‹</button>
            <button type="button" aria-label="Siguiente" onClick={() => scrollBy(1)}>›</button>
          </div>
        </div>

        <div className="carousel" ref={trackRef} role="region" aria-label="Galería de imágenes" tabIndex={0}>
          {GALLERY_ITEMS.map((item, i) => (
            <figure className="carousel__item" key={i}>
              <MediaPlaceholder label={`Galería ${i + 1}`} file={item.file} ratio="4 / 3" />
              <figcaption className="carousel__caption">{item.caption}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
