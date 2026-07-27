import type { Route } from './+types/home';
import type { CSSProperties } from 'react';
import { Button } from '~/components/Button';
import { MediaPlaceholder } from '~/components/MediaPlaceholder';
import { useT } from '~/i18n/useT';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'SAMORAI | Precision Wheels' },
    { name: 'description', content: 'SAMORAI Victoria — llantas de aleación premium. Fundición de precisión, PCD 5×120 y acabados de autor. Construimos identidad, rueda a rueda.' },
  ];
}

export default function Home() {
  const h = useT().home;

  return (
    <>
      {/* 1 · Hero — placeholder de imagen de fondo (/images/home-hero.jpg) */}
      <section
        className="page-hero page-hero--ph"
        style={{ '--hero-bg': "url('/images/home-hero.png')" } as CSSProperties}
      >
        <div className="container">
          <span className="eyebrow" style={{ color: '#ededed' }}>{h.heroEyebrow}</span>
          <h1>{h.heroTitle}</h1>
          <p className="page-hero__subtitle">{h.heroSubtitle}</p>
          <div style={{ marginTop: 'var(--space-6)' }}>
            <Button href="/the-wheels" variant="primary" size="large">{h.heroCta}</Button>
          </div>
        </div>
      </section>

      {/* 2 · Diseñamos al detalle (sección clara: texto + imagen) */}
      <section className="section home-light" aria-label={h.s2Title}>
        <div className="container">
          <div className="grid-2 home-split" style={{ alignItems: 'center' }}>
            <div>
              <h2>{h.s2Title}</h2>
              <p style={{ marginTop: 'var(--space-5)' }}>{h.s2Body}</p>
              <p className="home-tag">{h.s2Tag}</p>
            </div>
            <MediaPlaceholder label="Detalle" file="/images/home-detalle.png" ratio="9 / 10" />
          </div>
        </div>
      </section>

      {/* 3 · Descubre el Modelo Victoria (imagen grande que sangra + texto) */}
      <section className="section home-feature" aria-label="Victoria">
        <div className="container">
          <div className="grid-2 home-split" style={{ alignItems: 'center' }}>
            <MediaPlaceholder className="home-victoria-img" label="Victoria" file="/images/home-victoria.png" ratio="4 / 3" />
            <div>
              <h2>{h.s3TitlePre}<em>{h.s3TitleAccent}</em>{h.s3TitlePost}</h2>
              <p className="home-lead" style={{ marginTop: 'var(--space-4)' }}>{h.s3Subtitle}</p>
              <p style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>{h.s3Body}</p>
              <Button href="/the-wheels/victoria" variant="secondary">{h.s3Cta}</Button>
            </div>
          </div>
        </div>
      </section>

      {/* 4 · Cita de marca (banda oscura fija) */}
      <section className="section band-dark" aria-label="Manifiesto">
        <div className="container">
          <blockquote className="dynasty-quote">
            {h.quotePre}<em>{h.quoteAccent}</em>{h.quotePost}
          </blockquote>
        </div>
      </section>

      {/* 5 · ¿Hablamos? — CTA de contacto (solo texto; imagen pendiente) */}
      <section className="section home-light" aria-label={h.cTitle}>
        <div className="container">
          <p className="home-tag home-tag--lg">{h.cTag}</p>
          <h2 style={{ marginTop: 'var(--space-3)' }}>{h.cTitle}</h2>
          <p style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>{h.cBody}</p>
          <Button href="/contacto" variant="primary">{h.cCta}</Button>
        </div>
      </section>
    </>
  );
}
