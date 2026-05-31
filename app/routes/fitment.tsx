import type { Route } from './+types/fitment';
import { useEffect } from 'react';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { SectionHeader } from '~/components/SectionHeader';
import { Button } from '~/components/Button';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Fitment Guide — SAMORAI Wheels' },
    { name: 'description', content: 'Understanding PCD, ET offset, center bore, and why hub rings matter for perfect wheel fitment.' },
  ];
}

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
      <div
        style={{
          background: 'linear-gradient(180deg, var(--color-bg-elevated) 0%, var(--color-bg) 100%)',
          borderBottom: '1px solid var(--color-border)',
          padding: 'var(--space-20) 0 var(--space-16)',
        }}
      >
        <div className="container">
          <span className="eyebrow">Technical Reference</span>
          <h1 style={{ marginBottom: 'var(--space-5)', maxWidth: '14ch' }}>
            Wheel Fitment Guide
          </h1>
          <p style={{ fontSize: 'var(--text-lg)', maxWidth: '55ch' }}>
            Understanding the numbers behind every wheel specification — so your Victoria
            fits exactly as engineered.
          </p>
        </div>
      </div>

      {/* Core concepts */}
      <section className="section" aria-label="Fitment concepts">
        <div className="container">
          <SectionHeader
            eyebrow="The Fundamentals"
            title="Three Numbers That Define Fitment"
          />

          <div className="fitment-concepts">
            <div className="fitment-concept">
              <p className="fitment-concept__abbr">PCD</p>
              <h3 className="fitment-concept__name">Pitch Circle Diameter</h3>
              <p className="fitment-concept__desc">
                The diameter of the imaginary circle passing through the center of each
                wheel bolt. Expressed as bolt count × diameter (e.g. 5×120). A wheel
                and hub must share the same PCD. The Victoria is 5×120 — the standard
                for most BMW models.
              </p>
            </div>

            <div className="fitment-concept">
              <p className="fitment-concept__abbr">ET</p>
              <h3 className="fitment-concept__name">Offset (Einpresstiefe)</h3>
              <p className="fitment-concept__desc">
                The distance in mm from the wheel's mounting face to its geometric
                centerline. Higher ET (e.g. ET45) moves the wheel inward — toward the
                car. Lower ET (e.g. ET25) pushes it outward. Critical for brake caliper
                and arch clearance. Victoria comes in ET35 and ET45 options.
              </p>
            </div>

            <div className="fitment-concept">
              <p className="fitment-concept__abbr">CB</p>
              <h3 className="fitment-concept__name">Center Bore</h3>
              <p className="fitment-concept__desc">
                The diameter of the central hole in the wheel that fits over the
                vehicle's hub spigot. A wheel centered only by its bolts — not the hub
                — can develop harmonic vibration at speed. The Victoria base CB is
                72.6mm, matching BMW's standard hub diameter.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why hub rings */}
      <section className="section section--elevated section--bordered" aria-label="Hub rings explanation">
        <div className="container">
          <div className="hub-rings-section">
            <div>
              <span className="eyebrow">Precision Fitment</span>
              <h2>Why Hub Rings Matter</h2>
              <p style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
                Wheel bolts are designed to clamp — not to center. If the wheel's center
                bore is larger than the vehicle's hub, the wheel relies on bolt tension
                for its radial position. Under load, this can shift, causing vibration.
              </p>
              <p style={{ marginBottom: 'var(--space-5)' }}>
                A hub ring fills the gap between wheel CB and hub OD with exact
                tolerances — typically within 0.1mm — transferring the centering function
                back to the hub spigot, where it belongs.
              </p>
              <p style={{ marginBottom: 'var(--space-8)' }}>
                SAMORAI hub rings will be precision-machined from billet aluminum,
                logo-engraved, and available for any combination of wheel CB and vehicle CB.
              </p>
              <Button
                href="/fitment"
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
      <section className="section" aria-label="Hub ring selector">
        <div className="container">
          <SectionHeader
            eyebrow="Coming Soon"
            title="Custom Hub Ring Selector"
            subtitle="Select your wheel center bore and vehicle hub diameter. We machine your rings to exact tolerances."
            center
          />

          <div
            style={{
              maxWidth: '600px',
              margin: '0 auto',
              padding: 'var(--space-10)',
              border: '1px dashed var(--color-border-strong)',
              borderRadius: 'var(--radius-xl)',
              textAlign: 'center',
            }}
            aria-label="Hub ring selector — coming soon"
          >
            <p
              style={{
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: 'var(--tracking-widest)',
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
                marginBottom: 'var(--space-6)',
              }}
            >
              Wheel CB: 72.6mm → Vehicle CB: [your car]
            </p>

            <div
              style={{
                display: 'flex',
                gap: 'var(--space-4)',
                justifyContent: 'center',
                marginBottom: 'var(--space-6)',
              }}
            >
              {['57.1', '60.1', '65.1', '66.9', '73.1'].map((cb) => (
                <div
                  key={cb}
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-mono)',
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

            <p
              style={{
                fontSize: 'var(--text-xs)',
                letterSpacing: 'var(--tracking-widest)',
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
                marginBottom: 'var(--space-6)',
              }}
            >
              Custom hub ring selector — coming soon
            </p>

            <Button
              variant="secondary"
              onClick={handleHubRingsInterest}
            >
              Register Interest
            </Button>
          </div>
        </div>
      </section>

      {/* CTA to shop */}
      <section className="section section--elevated" aria-label="Shop CTA">
        <div className="container" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 'var(--space-5)' }}>Ready for Victoria?</h2>
          <p style={{ marginInline: 'auto', marginBottom: 'var(--space-8)' }}>
            Browse all available sizes and finishes. Hub ring fitment confirmed for
            5×120 vehicles with 72.6mm hub as standard.
          </p>
          <Button href="/shop" variant="primary" size="large">
            Shop Victoria Wheels
          </Button>
        </div>
      </section>
    </>
  );
}
