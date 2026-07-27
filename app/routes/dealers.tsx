import type { Route } from './+types/dealers';
import { useEffect } from 'react';
import { redirect } from 'react-router';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { SectionHeader } from '~/components/SectionHeader';
import { Button } from '~/components/Button';

// The Dealers está bloqueada hasta una fase más avanzada del proyecto.
// El redirect deja la ruta inaccesible; el componente de abajo se conserva
// intacto para retomarla — para reactivar, elimina este loader.
export function loader() {
  return redirect('/', 307);
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'The Dealers | SAMORAI' },
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

          {/* Mapa (componente 23) — Fase 1: dark theme sin pins */}
          <div className="map-demo" aria-label="Mapa de distribuidores" style={{ marginBottom: 'var(--sp-6)' }}>
            <svg className="map-svg" viewBox="0 0 1200 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <g stroke="rgba(215,181,91,.08)" strokeWidth="1" fill="none">
                {[60, 120, 180, 240, 300].map((y) => (
                  <line key={`h${y}`} x1="0" y1={y} x2="1200" y2={y} />
                ))}
                {[100, 250, 400, 550, 700, 850, 1000, 1150].map((x) => (
                  <line key={`v${x}`} x1={x} y1="0" x2={x} y2="340" />
                ))}
              </g>
              <g fill="rgba(215,181,91,.06)" stroke="rgba(215,181,91,.16)" strokeWidth="1">
                <path d="M540 90 q60 -20 120 10 q40 30 20 80 q-30 50 -110 40 q-70 -10 -60 -80 q5 -35 30 -50 Z" />
                <path d="M700 150 q50 -10 70 30 q10 40 -40 55 q-55 5 -55 -45 q0 -30 25 -40 Z" />
              </g>
            </svg>
            <div className="map-grain" aria-hidden="true" />
            <span className="map-attr">Mapbox · red en construcción</span>
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
              <Button href="/contacto" variant="primary">Contact Support</Button>
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
                <Button href="/contacto" variant="primary">
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
            <Button href="/contacto" variant="primary" size="large">Contact Support</Button>
            <Button href="/the-wheels" variant="secondary" size="large">View Wheels</Button>
          </div>
        </div>
      </section>
    </>
  );
}
