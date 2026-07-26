import type { Route } from './+types/the-dynasty';
import type { CSSProperties } from 'react';
import { MediaPlaceholder as MediaPh } from '~/components/MediaPlaceholder';
import { useT } from '~/i18n/useT';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'The Dynasty | SAMORAI' },
    { name: 'description', content: 'Devolver el arte de la personalización a la automoción. La visión, la historia y los valores detrás de SAMORAI.' },
  ];
}

/**
 * The Dynasty — página de identidad de marca. Copy en i18n (t.dynasty, ES/EN).
 * Imágenes: placeholders hasta subirlas a `public/images/` (ver <MediaPh> y
 * el `--hero-bg` del hero).
 */
export default function TheDynasty() {
  const d = useT().dynasty;

  return (
    <>
      {/* 1 · Hero — placeholder de imagen de fondo. Cuando exista el archivo,
          se muestra automáticamente; hasta entonces se ve el patrón rayado. */}
      <div
        className="page-hero page-hero--ph"
        style={{ '--hero-bg': "url('/images/dynasty-hero.jpg')" } as CSSProperties}
      >
        <div className="container">
          <span className="eyebrow">{d.heroEyebrow}</span>
          <h1>{d.heroTitle}</h1>
          <p className="page-hero__subtitle">{d.heroSubtitle}</p>
        </div>
      </div>

      {/* 2 · La historia */}
      <section className="section section--elevated" aria-label={d.originEyebrow}>
        <div className="container">
          <div className="grid-2" style={{ alignItems: 'start', gap: 'var(--space-16)' }}>
            <div>
              <span className="eyebrow">{d.originEyebrow}</span>
              <p style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>{d.story1}</p>
              <p style={{ marginBottom: 'var(--space-8)' }}>{d.story2}</p>

              <h2 style={{ marginBottom: 'var(--space-5)' }}>{d.visionTitle}</h2>
              <p style={{ marginBottom: 'var(--space-6)' }}>{d.story3}</p>
              <p style={{ color: 'var(--color-text-primary)', fontWeight: 'var(--font-weight-semibold)' }}>
                {d.story4}
              </p>
            </div>

            <MediaPh
              label="Historia / fundador"
              file="/images/dynasty-historia.jpg"
              ratio="10 / 9"
              style={{ position: 'sticky', top: 'calc(var(--header-height) + var(--space-8))' }}
            />
          </div>
        </div>
      </section>

      {/* 3 · Nuestros valores (sección clara, filosofía bushido) */}
      <section className="section dynasty-values" aria-label={d.valuesTitle}>
        <div className="container">
          <h2 className="dynasty-values__title">{d.valuesTitle}</h2>
          <p className="dynasty-values__intro">{d.valuesIntro}</p>

          <div className="dynasty-values__grid">
            <div className="dynasty-value">
              <h3 className="dynasty-value__title">{d.value1Title}</h3>
              <p className="dynasty-value__text">{d.value1Text}</p>
              <MediaPh label="Valor 1" file="/images/dynasty-valor-1.jpg" ratio="5 / 4" />
            </div>

            <div className="dynasty-value">
              <h3 className="dynasty-value__title">{d.value2Title}</h3>
              <p className="dynasty-value__text">{d.value2Text}</p>
              <MediaPh label="Valor 2" file="/images/dynasty-valor-2.jpg" ratio="5 / 4" />
            </div>

            <div className="dynasty-value">
              <h3 className="dynasty-value__title">{d.value3Title}</h3>
              <p className="dynasty-value__text">{d.value3Text}</p>
              <MediaPh label="Valor 3" file="/images/dynasty-valor-3.jpg" ratio="5 / 4" />
            </div>
          </div>
        </div>
      </section>

      {/* 4 · Cita de cierre */}
      <section className="section section--elevated" aria-label="Manifiesto">
        <div className="container">
          <hr className="sep-line" style={{ marginBottom: 'var(--space-12)' }} />
          <blockquote className="dynasty-quote">
            {d.quoteMain} <em>{d.quoteAccent}</em>
          </blockquote>
        </div>
      </section>
    </>
  );
}
