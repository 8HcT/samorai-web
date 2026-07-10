import type { ReactNode } from 'react';

interface LegalPageProps {
  eyebrow: string;
  title: string;
  /** Última actualización (placeholder hasta validación legal) */
  updated?: string;
  children: ReactNode;
}

/**
 * Chrome común de las páginas legales (/legal, /privacidad, /cookies).
 * El contenido es PLACEHOLDER: debe redactarlo o validarlo un abogado
 * antes del lanzamiento (LSSI + RGPD). Ver Sección 2 del Master Brief.
 */
export function LegalPage({ eyebrow, title, updated, children }: LegalPageProps) {
  return (
    <>
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          {updated && (
            <p className="page-hero__subtitle">Última actualización: {updated}</p>
          )}
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
            <strong style={{ color: 'var(--s-gold)' }}>Texto pendiente.</strong>{' '}
            Contenido de marcador de posición. La redacción definitiva debe ser
            elaborada o validada por un abogado antes del lanzamiento.
          </div>

          {children}
        </div>
      </section>
    </>
  );
}
