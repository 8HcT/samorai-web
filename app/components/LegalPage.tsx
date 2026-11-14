import { useT } from '~/i18n/useT';

/**
 * Páginas legales (/legal, /privacidad, /cookies) en los dos idiomas.
 * El contenido es PROVISIONAL (i18n `legal.*`): debe redactarlo o validarlo
 * un abogado antes del lanzamiento (LSSI + RGPD). Ver Sección 2 del Master Brief.
 */
export function LegalPage({ doc }: { doc: 'notice' | 'privacy' | 'cookies' }) {
  const l = useT().legal;
  const { eyebrow, title, sections } = l[doc];
  return (
    <>
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p className="page-hero__subtitle">{l.updated} {l.pending}</p>
        </div>
      </div>

      <section className="section" aria-label={title}>
        <div className="container" style={{ maxWidth: '760px' }}>
          {/* Aviso de contenido pendiente — eliminar cuando llegue el texto legal definitivo */}
          <div
            role="note"
            style={{
              borderLeft: '3px solid var(--s-gold)',
              background: 'var(--s-gold-10)',
              padding: 'var(--space-5) var(--space-6)',
              marginBottom: 'var(--space-10)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <strong style={{ color: 'var(--s-gold)' }}>{l.pendingTitle}</strong> {l.pendingBody}
          </div>

          {sections.map((s) => (
            <div key={s.h}>
              <h3>{s.h}</h3>
              <p>{s.p}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
