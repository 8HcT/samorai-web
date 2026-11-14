import type { Route } from './+types/home';
import { cssBackground, optimizedSrc } from '~/lib/images';
import { organizationJsonLd, rootSeoData, seoMeta, seoStrings, websiteJsonLd } from '~/lib/seo';
import type { CSSProperties } from 'react';
import { Button } from '~/components/Button';
import { MediaPlaceholder } from '~/components/MediaPlaceholder';
import { useT } from '~/i18n/useT';

export const links: Route.LinksFunction = () => [
  // El hero es un fondo CSS (LCP): sin preload el navegador lo descubre tarde.
  { rel: 'preload', as: 'image', href: optimizedSrc('/images/home-hero.png', 1920), type: 'image/webp', fetchPriority: 'high' },
];

export function meta(args: Route.MetaArgs) {
  const { origin, locale } = rootSeoData(args);
  const s = seoStrings(args).home;
  return seoMeta(args, {
    title: s.title,
    description: s.description,
    jsonLd: [organizationJsonLd(origin), websiteJsonLd(origin, locale)],
  });
}

export default function Home() {
  const { home: h, a11y } = useT();

  return (
    <>
      {/* 1 · Hero — placeholder de imagen de fondo (/images/home-hero.jpg) */}
      <section
        className="page-hero page-hero--ph"
        style={{ '--hero-bg': cssBackground('/images/home-hero.png') } as CSSProperties}
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
            <MediaPlaceholder label="Detalle" alt={h.altDetail} file="/images/home-detalle.png" ratio="9 / 10" />
          </div>
        </div>
      </section>

      {/* 3 · Descubre el Modelo Victoria (imagen sangra izquierda y desborda sección) */}
      <section className="section home-feature" aria-label="Victoria">
        <MediaPlaceholder className="home-victoria-img" label="Victoria" alt={h.altVictoria} file="/images/home-victoria.png" />
        <div className="container">
          <div className="home-victoria-text">
            <h2>{h.s3TitlePre}<em>{h.s3TitleAccent}</em>{h.s3TitlePost}</h2>
            <p className="home-lead" style={{ marginTop: 'var(--space-4)' }}>{h.s3Subtitle}</p>
            <p style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>{h.s3Body}</p>
            <Button href="/the-wheels/victoria" variant="secondary">{h.s3Cta}</Button>
          </div>
        </div>
      </section>

      {/* 4 · Cita de marca (banda oscura fija) */}
      <section className="section band-dark" aria-label={a11y.manifesto}>
        <div className="container">
          <blockquote className="dynasty-quote">
            {h.quotePre}<em>{h.quoteAccent}</em>{h.quotePost}
          </blockquote>
        </div>
      </section>

      {/* 5 · ¿Hablamos? — CTA de contacto */}
      <section className="section home-light" aria-label={h.cTitle}>
        <div className="container">
          <div className="grid-2 home-split" style={{ alignItems: 'center' }}>
            <div>
              <p className="home-tag home-tag--lg">{h.cTag}</p>
              <h2 style={{ marginTop: 'var(--space-3)' }}>{h.cTitle}</h2>
              <p style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>{h.cBody}</p>
              <Button href="/contacto" variant="primary">{h.cCta}</Button>
            </div>
            <MediaPlaceholder label="Contacto" alt={h.altContact} file="/images/home-contacto.png" ratio="7 / 5" />
          </div>
        </div>
      </section>
    </>
  );
}
