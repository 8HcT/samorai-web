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
    { name: 'description', content: 'SAMORAI Victoria — premium alloy wheels engineered for BMW. Precision fitment, performance aesthetics.' },
  ];
}

export default function Home() {
  const featured = getFeaturedProducts();

  return (
    <>
      {/* Hero */}
      <section className="hero" aria-label="Hero">
        <div className="hero__bg" aria-hidden="true" />
        <div className="hero__visual" aria-hidden="true">
          <div className="hero__visual-ring" />
        </div>
        <div className="container hero__content">
          <span className="eyebrow">Precision Engineering</span>
          <h1 className="hero__title">
            SAMORAI
            <span>Wheels</span>
          </h1>
          <p className="hero__subtitle">
            Victoria — Engineered for BMW. Refined for the road.
          </p>
          <div className="hero__cta">
            <Button href="/shop" variant="primary" size="large">
              Shop Victoria
            </Button>
            <Button href="/fitment" variant="ghost" size="large">
              Fitment Guide
            </Button>
          </div>
        </div>
        <div className="hero__scroll-hint" aria-hidden="true">
          <div className="hero__scroll-line" />
          <span>Scroll</span>
        </div>
      </section>

      {/* Featured product */}
      <section className="section section--elevated" aria-label="Featured wheel">
        <div className="container">
          <SectionHeader
            eyebrow="First Commercial Model"
            title="Victoria"
            subtitle="A five-spoke alloy wheel built around BMW 5×120 fitment standards with motorsport-grade geometry and precision powder finishes."
          />
          <ProductGrid products={featured} />
          <div style={{ marginTop: 'var(--space-10)', textAlign: 'center' }}>
            <Button href="/shop" variant="secondary">
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
                Designed from OEM specifications. The Victoria sits on your BMW hub
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
            <Button href="/shop" variant="primary" size="large">
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
