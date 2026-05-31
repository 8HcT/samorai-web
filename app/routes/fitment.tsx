import type { Route } from './+types/fitment';
import { useEffect } from 'react';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { SectionHeader } from '~/components/SectionHeader';
import { Button } from '~/components/Button';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Fitment Guide — SAMORAI Wheels' },
    { name: 'description', content: 'How to verify that SAMORAI wheels fit your vehicle — PCD, ET, center bore, brake clearance and hub ring guidance.' },
  ];
}

const FITMENT_CHECKS = [
  {
    abbr: 'PCD',
    title: 'Bolt Pattern (PCD)',
    desc: 'Your vehicle\'s bolt pattern must match the wheel exactly. The Victoria is 5×120. Check your vehicle handbook, door jamb sticker, or consult a specialist. Do not attempt to fit wheels with a different PCD.',
  },
  {
    abbr: 'CB',
    title: 'Center Bore',
    desc: 'Your hub\'s outer diameter must be equal to or smaller than the wheel\'s center bore (72.6mm for the Victoria). If your hub OD is smaller, you need hub rings to fill the gap. An incorrect CB will cause vibration that no wheel balancing can cure.',
  },
  {
    abbr: 'ET',
    title: 'Offset Range',
    desc: 'Your vehicle has an acceptable ET range for its wheel arch and suspension geometry. The Victoria offers ET35 and ET45. Confirm your vehicle\'s minimum and maximum ET, factoring in brake caliper clearance and arch clearance with your tyre size.',
  },
  {
    abbr: 'Ø',
    title: 'Diameter & Width',
    desc: 'An 18″ wheel requires adequate clearance around brake components and within the wheel arch. Tyre size must be matched to wheel width. Confirm available tyre sizes for your chosen width before ordering.',
  },
  {
    abbr: 'BRK',
    title: 'Brake Caliper Clearance',
    desc: 'Large aftermarket brake calipers may not clear all wheel designs. If your vehicle has upgraded brakes, physically verify clearance or consult your brake supplier for minimum wheel dimensions.',
  },
  {
    abbr: 'TYR',
    title: 'Tyre Compatibility',
    desc: 'Confirm that your chosen tyre size is compatible with the wheel width and your vehicle\'s recommended tyre sizes. Consult a tyre specialist for correct fitment and load index requirements.',
  },
];

export default function Fitment() {
  useEffect(() => {
    trackEvent('fitment_page_viewed', {});
  }, []);

  function handleHubRingsInterest() {
    trackEvent('hub_rings_interest_clicked', { source: 'fitment_page' });
  }

  return (
    <>
      {/* Hero */}
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow">Compatibility</span>
          <h1>Fitment Guide</h1>
          <p className="page-hero__subtitle">
            SAMORAI wheels are engineered to broad multi-vehicle specifications, but
            fitment must always be verified for your specific vehicle before installation.
          </p>
        </div>
      </div>

      {/* Compatibility intro */}
      <section className="section" aria-label="Compatibility overview">
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)', alignItems: 'start' }}>
            <div>
              <span className="eyebrow">Multi-Vehicle Compatibility</span>
              <h2 style={{ marginBottom: 'var(--space-5)' }}>Designed for Compatibility. Not Guaranteed for Every Car.</h2>
              <p style={{ marginBottom: 'var(--space-5)' }}>
                The Victoria is designed around the 5×120 PCD standard, which is shared by
                a wide range of vehicles across multiple manufacturers. However, PCD alone does
                not determine compatibility.
              </p>
              <p style={{ marginBottom: 'var(--space-5)' }}>
                Center bore, offset range, wheel diameter, tyre clearance, and brake caliper
                clearance all vary between vehicles — even those sharing the same bolt pattern.
                Each application must be verified individually.
              </p>
              <p>
                If you are unsure, use our checklist below, consult our{' '}
                <a href="/technology" style={{ color: 'var(--color-accent)' }}>technology page</a>{' '}
                for detailed specification explanations, or contact{' '}
                <a href="/support" style={{ color: 'var(--color-accent)' }}>support</a> directly.
              </p>
            </div>
            <div
              style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-8)',
              }}
            >
              <p className="label" style={{ marginBottom: 'var(--space-5)' }}>Victoria Base Specifications</p>
              <dl style={{ display: 'grid', gap: 'var(--space-3)' }}>
                {[
                  ['PCD', '5×120'],
                  ['Center Bore', '72.6mm'],
                  ['Diameter', '18″'],
                  ['Available Widths', '8.5J, 9J, 9.5J'],
                  ['Available Offsets', 'ET35, ET45'],
                  ['Max Load', '650kg / wheel'],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', paddingBlock: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-semibold)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>{label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>{value}</span>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* Fitment checklist */}
      <section className="section section--elevated section--bordered" aria-label="Fitment checklist">
        <div className="container">
          <SectionHeader
            eyebrow="Before You Order"
            title="Fitment Verification Checklist"
            subtitle="Work through each point for your specific vehicle. If any check fails or is uncertain, do not proceed without professional guidance."
          />

          <div className="fitment-checklist" role="list">
            {FITMENT_CHECKS.map((item) => (
              <div key={item.abbr} className="fitment-check-item" role="listitem">
                <div className="fitment-check-item__icon" aria-hidden="true">{item.abbr}</div>
                <div>
                  <p className="fitment-check-item__title">{item.title}</p>
                  <p className="fitment-check-item__desc">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Hub rings */}
      <section className="section" aria-label="Hub rings">
        <div className="container">
          <div className="hub-rings-section">
            <div>
              <span className="eyebrow">Center Bore Adaptation</span>
              <h2>Custom Hub Rings</h2>
              <p style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
                If your vehicle's hub diameter is smaller than the Victoria's 72.6mm center bore,
                a hub ring is required. Without it, the wheel will only be centered by the bolts —
                which can produce vibration under load.
              </p>
              <p style={{ marginBottom: 'var(--space-5)' }}>
                SAMORAI hub rings are being developed as precision-machined billet aluminum
                components, machined to fill the gap between wheel CB and your vehicle's hub OD
                with bilateral tolerances. Available with optional SAMORAI logo engraving.
              </p>
              <p style={{ marginBottom: 'var(--space-8)' }}>
                The custom hub ring selector is coming soon. Register interest below.
              </p>
              <Button
                variant="primary"
                onClick={handleHubRingsInterest}
              >
                Register Interest in Hub Rings
              </Button>
            </div>

            <div className="hub-rings-visual" aria-hidden="true">
              <div className="hub-rings-diagram">
                <div className="hub-rings-diagram__ring hub-rings-diagram__ring--outer" />
                <div className="hub-rings-diagram__ring hub-rings-diagram__ring--hub">
                  <span className="hub-rings-diagram__label">Hub ring</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Coming soon selector */}
      <section className="section section--elevated" aria-label="Hub ring configurator">
        <div className="container">
          <SectionHeader
            eyebrow="Coming Soon"
            title="Hub Ring Configurator"
            subtitle="Select your wheel center bore and vehicle hub diameter. Receive precision-machined hub rings sized to your specification."
            center
          />

          <div
            style={{
              maxWidth: '580px',
              margin: '0 auto',
              padding: 'var(--space-10)',
              border: '1px dashed var(--color-border-strong)',
              borderRadius: 'var(--radius-xl)',
              textAlign: 'center',
            }}
            aria-label="Hub ring configurator — coming soon"
          >
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                letterSpacing: 'var(--tracking-widest)',
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
                marginBottom: 'var(--space-6)',
              }}
            >
              Wheel CB: 72.6mm → Vehicle hub OD: [select]
            </p>

            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
              {['57.1', '60.1', '65.1', '66.9', '73.1'].map((cb) => (
                <div
                  key={cb}
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-muted)',
                    opacity: 0.5,
                    cursor: 'not-allowed',
                  }}
                  aria-hidden="true"
                >
                  {cb}mm
                </div>
              ))}
            </div>

            <Button variant="secondary" onClick={handleHubRingsInterest}>
              Register Interest
            </Button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section" aria-label="CTA">
        <div className="container" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 'var(--space-5)' }}>Ready to Order?</h2>
          <p style={{ marginInline: 'auto', marginBottom: 'var(--space-8)' }}>
            Once you have confirmed fitment for your vehicle, browse the Victoria range.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button href="/wheels" variant="primary" size="large">Shop Victoria Wheels</Button>
            <Button href="/technology" variant="secondary" size="large">Technical Details</Button>
          </div>
        </div>
      </section>
    </>
  );
}
