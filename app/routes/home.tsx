import type { Route } from './+types/home';
import { Link } from 'react-router';
import { getFeaturedProducts } from '~/data/products';
import { SectionHeader } from '~/components/SectionHeader';
import { ProductGrid } from '~/components/ProductGrid';
import { Button } from '~/components/Button';
import { useT } from '~/i18n/useT';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'SAMORAI Wheels — Precision Engineered' },
    { name: 'description', content: 'SAMORAI Victoria — premium alloy wheels. Precision cast, performance driven. Available in 18" with 5×120 PCD.' },
  ];
}

export default function Home() {
  const featured = getFeaturedProducts();
  const t = useT();
  const h = t.home;

  return (
    <>
      {/* Hero */}
      <section className="hero" aria-label="Hero">
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
            Vic<em>toria</em>
          </h1>

          <p className="hero__tagline">
            {h.heroTagline1}<br />
            {h.heroTagline2}
          </p>

          <div className="hero__cta">
            <Button href="/the-wheels" variant="primary" size="large">
              {h.heroCtaPrimary}
            </Button>
            <Button href="/contacto" variant="ghost" size="large">
              {h.heroCtaSecondary}
            </Button>
          </div>
        </div>

        {/* specs strip anchored to bottom */}
        <div className="hero__specs-strip" aria-label="Victoria key specs">
          <div className="container">
            <div className="hero__specs-inner">
              <div className="hero__spec-item">
                <span className="hero__spec-label">{h.specModel}</span>
                <span className="hero__spec-value hero__spec-value--accent">Victoria</span>
              </div>
              <div className="hero__spec-item">
                <span className="hero__spec-label">{h.specDiameter}</span>
                <span className="hero__spec-value">18″</span>
              </div>
              <div className="hero__spec-item">
                <span className="hero__spec-label">{h.specPcd}</span>
                <span className="hero__spec-value">5×120</span>
              </div>
              <div className="hero__spec-item">
                <span className="hero__spec-label">{h.specCb}</span>
                <span className="hero__spec-value">72.6mm</span>
              </div>
              <div className="hero__spec-item">
                <span className="hero__spec-label">{h.specLoad}</span>
                <span className="hero__spec-value">650kg</span>
              </div>
              <div className="hero__spec-item">
                <span className="hero__spec-label">{h.specFinishes}</span>
                <span className="hero__spec-value">3</span>
              </div>
              <div className="hero__spec-item">
                <span className="hero__spec-label">{h.specBrand}</span>
                <span className="hero__spec-value">SAMORAI</span>
              </div>
            </div>
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
          <ProductGrid products={featured} />
          <div style={{ marginTop: 'var(--space-10)', textAlign: 'center' }}>
            <Button href="/the-wheels" variant="secondary">
              {h.featuredBtn}
            </Button>
          </div>
        </div>
      </section>

      {/* Hub rings feature */}
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

      {/* Final CTA */}
      <section className="section" aria-label="Call to action">
        <div className="container" style={{ textAlign: 'center' }}>
          <span className="eyebrow">{h.finalEyebrow}</span>
          <h2 style={{ marginBottom: 'var(--space-5)' }}>{h.finalTitle}</h2>
          <p style={{ marginInline: 'auto', marginBottom: 'var(--space-10)' }}>
            {h.finalDesc}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button href="/the-wheels" variant="primary" size="large">
              {h.finalBtnPrimary}
            </Button>
            <Button href="/contacto" variant="secondary" size="large">
              {h.finalBtnSecondary}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
