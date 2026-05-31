import type { Route } from './+types/home';
import { Link } from 'react-router';
import { getFeaturedProducts } from '~/data/products';
import { SectionHeader } from '~/components/SectionHeader';
import { ProductGrid } from '~/components/ProductGrid';
import { Button } from '~/components/Button';
import { FitmentCallout } from '~/components/FitmentCallout';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'SAMORAI Wheels — Precision Engineered' },
    { name: 'description', content: 'SAMORAI Victoria — premium alloy wheels. Precision cast, performance driven. Available in 18" with 5×120 PCD.' },
  ];
}

export default function Home() {
  const featured = getFeaturedProducts();

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
            <span className="eyebrow" style={{ margin: 0 }}>First Model — 2025</span>
          </div>

          <h1 className="hero__model-name" aria-label="Victoria by SAMORAI">
            Vic<em>toria</em>
          </h1>

          <p className="hero__tagline">
            Precision cast. Performance driven.<br />
            18″ · 5×120 · Three finishes.
          </p>

          <div className="hero__cta">
            <Button href="/wheels" variant="primary" size="large">
              Shop Now
            </Button>
            <Button href="/fitment" variant="ghost" size="large">
              Fitment Guide
            </Button>
          </div>
        </div>

        {/* specs strip anchored to bottom */}
        <div className="hero__specs-strip" aria-label="Victoria key specs">
          <div className="container">
            <div className="hero__specs-inner">
              <div className="hero__spec-item">
                <span className="hero__spec-label">Model</span>
                <span className="hero__spec-value hero__spec-value--accent">Victoria</span>
              </div>
              <div className="hero__spec-item">
                <span className="hero__spec-label">Diameter</span>
                <span className="hero__spec-value">18″</span>
              </div>
              <div className="hero__spec-item">
                <span className="hero__spec-label">PCD</span>
                <span className="hero__spec-value">5×120</span>
              </div>
              <div className="hero__spec-item">
                <span className="hero__spec-label">Center Bore</span>
                <span className="hero__spec-value">72.6mm</span>
              </div>
              <div className="hero__spec-item">
                <span className="hero__spec-label">Max Load</span>
                <span className="hero__spec-value">650kg</span>
              </div>
              <div className="hero__spec-item">
                <span className="hero__spec-label">Finishes</span>
                <span className="hero__spec-value">3</span>
              </div>
              <div className="hero__spec-item">
                <span className="hero__spec-label">Brand</span>
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
            eyebrow="First Commercial Model"
            title="Victoria"
            subtitle="A five-spoke alloy wheel with motorsport-grade geometry, 5×120 PCD, and precision powder finishes. Engineered to fit precisely."
          />
          <ProductGrid products={featured} />
          <div style={{ marginTop: 'var(--space-10)', textAlign: 'center' }}>
            <Button href="/wheels" variant="secondary">
              View All Sizes & Finishes
            </Button>
          </div>
        </div>
      </section>

      {/* Hub rings feature */}
      <section className="section" aria-label="Hub rings">
        <div className="container">
          <div className="hub-rings-section">
            <div>
              <span className="eyebrow">Precision Fitment</span>
              <h2>Custom Hub Rings</h2>
              <p style={{ marginBottom: 'var(--space-6)', marginTop: 'var(--space-4)' }}>
                No fitment adapter should be an afterthought. SAMORAI hub rings are
                precision-machined to adapt our 72.6mm center bore to your vehicle's
                exact specification — eliminating harmonic vibration and ensuring a
                factory-grade seat on every drive.
              </p>
              <p style={{ marginBottom: 'var(--space-8)' }}>
                Select your wheel CB and vehicle CB. We machine your rings to tolerance.
                Available in billet aluminum with optional SAMORAI logo engraving.
              </p>
              <Button href="/fitment" variant="primary">
                Learn About Fitment
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
            eyebrow="Why SAMORAI"
            title="Built to a Higher Standard"
            center
          />
          <div className="brand-values">
            <div className="brand-value">
              <p className="brand-value__number">01</p>
              <h3 className="brand-value__title">Precision Geometry</h3>
              <p className="brand-value__text">
                Every spoke angle, every radius, every tolerance is calculated before
                the first mold is cut. No compromises.
              </p>
            </div>
            <div className="brand-value">
              <p className="brand-value__number">02</p>
              <h3 className="brand-value__title">Exact Fitment</h3>
              <p className="brand-value__text">
                Designed from OEM specifications. The Victoria seats on the hub
                as if it left the factory that way.
              </p>
            </div>
            <div className="brand-value">
              <p className="brand-value__number">03</p>
              <h3 className="brand-value__title">Premium Finish</h3>
              <p className="brand-value__text">
                Multi-coat powder applied under controlled conditions. Resistant to
                brake dust, road chemicals, and time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section" aria-label="Call to action">
        <div className="container" style={{ textAlign: 'center' }}>
          <span className="eyebrow">Ready to Build</span>
          <h2 style={{ marginBottom: 'var(--space-5)' }}>Find Your Set</h2>
          <p style={{ marginInline: 'auto', marginBottom: 'var(--space-10)' }}>
            Browse the Victoria range. Choose your size, finish, and offset.
            Custom hub rings available for non-standard center bore fitments.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button href="/wheels" variant="primary" size="large">
              Shop Now
            </Button>
            <Button href="/fitment" variant="secondary" size="large">
              Fitment Guide
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
