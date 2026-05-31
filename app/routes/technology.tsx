import type { Route } from './+types/technology';
import { useEffect } from 'react';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { SectionHeader } from '~/components/SectionHeader';
import { Button } from '~/components/Button';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Technology — SAMORAI Wheels' },
    { name: 'description', content: 'The engineering behind SAMORAI wheels — construction, geometry, fitment specifications and hub ring technology.' },
  ];
}

export default function Technology() {
  useEffect(() => {
    trackEvent('technology_page_viewed', {});
  }, []);

  return (
    <>
      {/* Hero */}
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow">Engineering</span>
          <h1>Technology</h1>
          <p className="page-hero__subtitle">
            Every dimension is deliberate. Every tolerance is specified. Every finish is controlled.
            This is what SAMORAI engineering looks like.
          </p>
        </div>
      </div>

      {/* Construction */}
      <section className="section" aria-label="Construction">
        <div className="container">
          <div className="tech-construction">
            <div className="tech-construction__visual" aria-hidden="true">
              <div className="tech-construction__wheel" />
            </div>
            <div>
              <span className="eyebrow">Material & Construction</span>
              <h2 style={{ marginBottom: 'var(--space-5)' }}>Cast Aluminum Alloy</h2>
              <p style={{ marginBottom: 'var(--space-5)' }}>
                The Victoria is constructed from cast aluminum alloy — selected for its
                strength-to-weight ratio, machinability, and ability to hold tight
                dimensional tolerances across the entire wheel geometry.
              </p>
              <p style={{ marginBottom: 'var(--space-5)' }}>
                The five-spoke architecture is designed to balance structural rigidity with
                weight distribution. Spoke angles, cross-sectional profiles, and spoke-to-barrel
                transitions are calculated to manage stress concentration under dynamic load.
              </p>
              <p>
                All critical dimensions — including center bore, bolt circle, and seat geometry —
                are machined to OEM-equivalent tolerances. No approximations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Fitment specs */}
      <section className="section section--elevated section--bordered" aria-label="Fitment specifications">
        <div className="container">
          <SectionHeader
            eyebrow="Fitment Specifications"
            title="The Numbers Behind Every Wheel"
            subtitle="Understanding these four parameters is essential to confirming whether a wheel is compatible with your vehicle."
          />

          <div className="tech-specs-grid">
            <div className="tech-spec-card">
              <p className="tech-spec-card__abbr">PCD</p>
              <h3 className="tech-spec-card__name">Pitch Circle Diameter</h3>
              <p className="tech-spec-card__desc">
                The diameter of the imaginary circle passing through the center of each
                wheel bolt. A wheel can only be mounted on a hub that shares the same PCD.
                Expressed as bolt count × diameter in mm. The Victoria ships at 5×120 —
                a common standard on many European performance vehicles, but not universal.
                Always confirm your vehicle's PCD before ordering.
              </p>
              <div className="tech-spec-card__values">
                <span className="tech-badge">5×120</span>
              </div>
            </div>

            <div className="tech-spec-card">
              <p className="tech-spec-card__abbr">ET</p>
              <h3 className="tech-spec-card__name">Offset (Einpresstiefe)</h3>
              <p className="tech-spec-card__desc">
                The distance in mm between the wheel's hub mounting face and its geometric
                centerline. A higher ET value (e.g. ET45) positions the wheel further inward
                relative to the vehicle centerline. A lower value (e.g. ET25) moves it
                outward. ET affects brake caliper clearance, arch clearance, and suspension
                geometry. Confirm your vehicle's acceptable ET range before selecting a variant.
              </p>
              <div className="tech-spec-card__values">
                <span className="tech-badge">ET35</span>
                <span className="tech-badge">ET45</span>
              </div>
            </div>

            <div className="tech-spec-card">
              <p className="tech-spec-card__abbr">CB</p>
              <h3 className="tech-spec-card__name">Center Bore</h3>
              <p className="tech-spec-card__desc">
                The diameter of the central aperture in the wheel that seats against the
                vehicle's hub spigot. When CB matches hub OD precisely, the wheel is
                hub-centric — centered by the hub itself, not by the wheel bolts.
                Hub-centric fitment eliminates harmonic vibration caused by radial imbalance.
                The Victoria base CB is 72.6mm. For vehicles with a different hub diameter,
                SAMORAI hub rings provide an exact adaptation.
              </p>
              <div className="tech-spec-card__values">
                <span className="tech-badge">72.6mm base</span>
                <span className="tech-badge">Hub rings available</span>
              </div>
            </div>

            <div className="tech-spec-card">
              <p className="tech-spec-card__abbr">LR</p>
              <h3 className="tech-spec-card__name">Load Rating</h3>
              <p className="tech-spec-card__desc">
                The maximum load each wheel is rated to carry under normal driving conditions.
                The Victoria is rated at 650kg per wheel. This must exceed the maximum load
                per axle of your vehicle divided by the number of wheels on that axle.
                Load rating is a safety specification — do not use wheels rated below your
                vehicle's requirements.
              </p>
              <div className="tech-spec-card__values">
                <span className="tech-badge">650kg / wheel</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Surface treatment */}
      <section className="section" aria-label="Surface treatment">
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-16)', alignItems: 'center' }}>
            <div>
              <span className="eyebrow">Surface Engineering</span>
              <h2 style={{ marginBottom: 'var(--space-5)' }}>Multi-Coat Powder Finish</h2>
              <p style={{ marginBottom: 'var(--space-5)' }}>
                Each Victoria wheel undergoes a multi-stage surface treatment process.
                The substrate is prepared to remove mill scale and surface oxides before
                primer application. The topcoat powder is applied electrostatically and
                cured under controlled temperature to achieve a uniform, fully bonded finish.
              </p>
              <p style={{ marginBottom: 'var(--space-5)' }}>
                The result resists brake dust adhesion, road salt, stone chips, and UV degradation
                better than standard single-coat processes. All three finishes — Anthracite Grey,
                Black Metallic, and Silver Metallic — use the same multi-coat process.
              </p>
              <p>
                Clear coat application provides additional protection and depth. Surface
                hardness is specified to resist minor abrasion without compromising finish
                adhesion or uniformity.
              </p>
            </div>
            <div
              style={{
                display: 'grid',
                gap: 'var(--space-3)',
              }}
            >
              {[
                { label: 'Substrate prep', desc: 'Surface oxide removal, degreasing' },
                { label: 'Primer coat', desc: 'Corrosion barrier, adhesion base' },
                { label: 'Powder topcoat', desc: 'Electrostatic application, oven cure' },
                { label: 'Clear coat', desc: 'UV protection, depth, hardness' },
              ].map((step, i) => (
                <div
                  key={step.label}
                  style={{
                    display: 'flex',
                    gap: 'var(--space-4)',
                    padding: 'var(--space-4) var(--space-5)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-card)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-accent)',
                      fontWeight: 'var(--font-weight-bold)',
                      flexShrink: 0,
                      paddingTop: '2px',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)' }}>
                      {step.label}
                    </p>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', maxWidth: 'none', lineHeight: 'var(--leading-snug)' }}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Hub ring technology */}
      <section className="section section--elevated" aria-label="Hub ring technology">
        <div className="container">
          <SectionHeader
            eyebrow="Precision Fitment"
            title="Hub Ring Technology"
            subtitle="Center bore adaptation engineered to OEM standards."
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-8)' }}>
            <div
              style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-8)',
              }}
            >
              <h3 style={{ marginBottom: 'var(--space-4)' }}>The Problem</h3>
              <p style={{ maxWidth: 'none' }}>
                When a wheel's center bore is larger than the vehicle's hub spigot diameter,
                there is a radial gap between hub and wheel. The wheel bolts become the only
                centering reference. Under dynamic load, this can allow micro-movement,
                producing vibration that cannot be balanced out — because the issue is
                geometric, not mass distribution.
              </p>
            </div>
            <div
              style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-accent-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-8)',
              }}
            >
              <h3 style={{ marginBottom: 'var(--space-4)', color: 'var(--color-accent)' }}>The Solution</h3>
              <p style={{ maxWidth: 'none' }}>
                A precision hub ring fills the annular gap between wheel CB and hub OD.
                Machined to a bilateral tolerance, the ring transfers the centering function
                to the hub spigot — exactly as on OEM wheels. SAMORAI hub rings will be
                available in billet aluminum with optional logo engraving, for any CB/hub
                combination required.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 'var(--space-10)', textAlign: 'center' }}>
            <Button href="/fitment" variant="primary">
              Fitment Guide
            </Button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section" aria-label="CTA">
        <div className="container" style={{ textAlign: 'center' }}>
          <span className="eyebrow">Built With Purpose</span>
          <h2 style={{ marginBottom: 'var(--space-5)' }}>See the Victoria</h2>
          <p style={{ marginInline: 'auto', marginBottom: 'var(--space-8)' }}>
            Three finishes. Four size options. One engineering standard.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button href="/wheels" variant="primary" size="large">Shop Wheels</Button>
            <Button href="/fitment" variant="secondary" size="large">Fitment Guide</Button>
          </div>
        </div>
      </section>
    </>
  );
}
