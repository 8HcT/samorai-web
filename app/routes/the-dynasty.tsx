import type { Route } from './+types/the-dynasty';
import { cssBackground } from '~/lib/images';
import { seoMeta, seoStrings } from '~/lib/seo';
import type { CSSProperties } from 'react';
import { MediaPlaceholder as MediaPh } from '~/components/MediaPlaceholder';
import { useT } from '~/i18n/useT';

export function meta(args: Route.MetaArgs) {
  const s = seoStrings(args).dynasty;
  return seoMeta(args, { title: s.title, description: s.description });
}

/**
 * The Dynasty — página de identidad de marca. Copy en i18n (t.dynasty, ES/EN).
 * Imágenes: placeholders hasta subirlas a `public/images/` (ver <MediaPh> y
 * el `--hero-bg` del hero).
 */
export default function TheDynasty() {
  const { dynasty: d, a11y } = useT();

  return (
    <>
      {/* 1 · Hero — placeholder de imagen de fondo. Cuando exista el archivo,
          se muestra automáticamente; hasta entonces se ve el patrón rayado. */}
      <div
        className="page-hero page-hero--ph"
        style={{ '--hero-bg': cssBackground('/images/dynasty-hero.png') } as CSSProperties}
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
              alt={d.altHistory}
              file="/images/dynasty-historia.png"
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
              <MediaPh label="Valor 1" alt={d.altValue1} file="/images/dynasty-valor-1.png" ratio="5 / 4" />
            </div>

            <div className="dynasty-value">
              <h3 className="dynasty-value__title">{d.value2Title}</h3>
              <p className="dynasty-value__text">{d.value2Text}</p>
              <MediaPh label="Valor 2" alt={d.altValue2} file="/images/dynasty-valor-2.png" ratio="5 / 4" />
            </div>

            <div className="dynasty-value">
              <h3 className="dynasty-value__title">{d.value3Title}</h3>
              <p className="dynasty-value__text">{d.value3Text}</p>
              <MediaPh label="Valor 3" alt={d.altValue3} file="/images/dynasty-valor-3.png" ratio="5 / 4" />
            </div>
          </div>
        </div>
      </section>

      {/* 4 · Cita de cierre (banda oscura fija) */}
      <section className="section band-dark" aria-label={a11y.manifesto}>
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
