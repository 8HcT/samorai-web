import type { Route } from './+types/dealers';
import { useEffect } from 'react';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { SectionHeader } from '~/components/SectionHeader';
import { Button } from '~/components/Button';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Dealers — SAMORAI Wheels' },
    { name: 'description', content: 'Find an authorized SAMORAI dealer or enquire about becoming a distribution partner.' },
  ];
}

export default function Dealers() {
  useEffect(() => {
    trackEvent('dealer_page_viewed', {});
  }, []);

  return (
    <>
      {/* Hero */}
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow">Distribution Network</span>
          <h1>Dealers</h1>
          <p className="page-hero__subtitle">
            Find an authorized SAMORAI retailer or enquire about becoming part of our growing dealer network.
          </p>
        </div>
      </div>

      {/* Locator section */}
      <section className="section" aria-label="Dealer locator">
        <div className="container">
          <SectionHeader
            eyebrow="Find a Dealer"
            title="Authorized Retailers"
          />

          {/* Map placeholder */}
          <div className="dealer-map-placeholder" aria-label="Dealer map — coming soon">
            <p className="dealer-map-placeholder__label">Dealer Map</p>
            <p className="dealer-map-placeholder__sub">Interactive locator coming soon</p>
          </div>

          {/* Empty state */}
          <div className="dealer-empty">
            <div className="dealer-empty__icon" aria-hidden="true">◎</div>
            <h3>No dealers listed yet</h3>
            <p>
              Our authorized dealer network is being established. If you are looking for
              a retailer in your region, contact us directly — we will connect you with
              the nearest partner as the network expands.
            </p>
            <div style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-4)', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button href="/support" variant="primary">Contact Support</Button>
            </div>
          </div>
        </div>
      </section>

      {/* Become a dealer */}
      <section className="section section--elevated" aria-label="Become a dealer">
        <div className="container">
          <div className="become-dealer">
            <div className="become-dealer__grid">
              <div>
                <span className="eyebrow">Partnership</span>
                <h2>Become an Authorized Dealer</h2>
                <p>
                  SAMORAI is building a focused network of retailers and automotive
                  specialists who share our commitment to quality and precision fitment.
                  If your business serves performance-oriented customers and you want
                  to carry our wheel range, we would like to hear from you.
                </p>
                <Button href="/support" variant="primary">
                  Enquire About Partnership
                </Button>
              </div>

              <div className="become-dealer__benefits">
                <p className="label" style={{ marginBottom: 'var(--space-5)' }}>What to expect</p>
                {[
                  'Exclusive regional availability in select markets',
                  'Technical training and fitment support materials',
                  'Direct access to product samples and pre-launch information',
                  'Competitive wholesale pricing structure',
                  'Marketing assets and brand guidelines',
                  'Priority access to new models and limited finishes',
                ].map((benefit) => (
                  <div key={benefit} className="dealer-benefit">
                    <span className="dealer-benefit__dot" />
                    <p className="dealer-benefit__text">{benefit}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="section" aria-label="Contact">
        <div className="container" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 'var(--space-5)' }}>Have Questions?</h2>
          <p style={{ marginInline: 'auto', marginBottom: 'var(--space-8)' }}>
            Our support team handles dealer enquiries, technical questions and order assistance.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button href="/support" variant="primary" size="large">Contact Support</Button>
            <Button href="/wheels" variant="secondary" size="large">View Wheels</Button>
          </div>
        </div>
      </section>
    </>
  );
}
