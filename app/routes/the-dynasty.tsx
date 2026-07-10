import type { Route } from './+types/the-dynasty';
import { SectionHeader } from '~/components/SectionHeader';
import { Button } from '~/components/Button';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'The Dynasty — SAMORAI Wheels' },
    { name: 'description', content: 'The Dynasty: la identidad, los valores y la comunidad detrás de SAMORAI. (Copy pendiente de confirmación.)' },
  ];
}

/**
 * The Dynasty — página de manifiesto / identidad de marca.
 * ⚠ Todo el copy es PLACEHOLDER. Según la Sección 2 del Master Brief, esta
 * página NO debe darse por cerrada hasta tener el texto definitivo del cliente.
 * La estructura sí es la del brief: Hero · Historia · Valores · Comunidad · Manifiesto.
 */
export default function TheDynasty() {
  return (
    <>
      {/* Aviso de trabajo — eliminar al integrar el copy final */}
      <div
        role="note"
        style={{
          background: 'var(--s-gold-10)',
          borderBottom: '1px solid var(--s-gold-30)',
          color: 'var(--s-gold)',
          textAlign: 'center',
          fontSize: 'var(--text-xs)',
          letterSpacing: 'var(--tracking-overline)',
          textTransform: 'uppercase',
          padding: 'var(--space-2) var(--space-4)',
        }}
      >
        Maqueta · copy pendiente de confirmación del cliente
      </div>

      {/* 1 · Hero de página */}
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow">The Dynasty</span>
          <h1>Más que ruedas.<br />Una manera de vivir.</h1>
          <p className="page-hero__subtitle">
            [Subheadline — la promesa o posicionamiento de la marca en una frase
            memorable.]
          </p>
        </div>
      </div>

      {/* 2 · La historia */}
      <section className="section section--elevated" aria-label="La historia">
        <div className="container">
          <div className="hub-rings-section">
            <div>
              <span className="eyebrow">El origen</span>
              <h2>La historia</h2>
              <p style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                [Año de fundación y ciudad. Quién hay detrás de SAMORAI: fundador
                o equipo, con el contexto personal que el cliente quiera compartir.]
              </p>
              <p>
                [Misión de la marca en 2–3 frases: qué hace SAMORAI y por qué
                existe. Tono cercano y con carácter — no una ficha de empresa.]
              </p>
              <p className="script" style={{ fontSize: 'var(--text-3xl)', marginTop: 'var(--space-6)' }}>
                [Tres adjetivos de personalidad]
              </p>
            </div>
            <div className="hub-rings-visual" aria-hidden="true">
              <div className="hub-rings-diagram">
                <div className="hub-rings-diagram__ring hub-rings-diagram__ring--outer" />
                <div className="hub-rings-diagram__ring hub-rings-diagram__ring--hub" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 · Los valores (filosofía bushido) */}
      <section className="section section--bordered" aria-label="Los valores">
        <div className="container">
          <SectionHeader
            eyebrow="Filosofía Bushido"
            title="Los valores"
            subtitle="Los pilares que definen a SAMORAI. Nombres y descripciones a confirmar."
            center
          />
          <div className="brand-values">
            <div className="brand-value">
              <p className="brand-value__number">01</p>
              <h3 className="brand-value__title">[Valor 1]</h3>
              <p className="brand-value__text">
                [Ej: «Artesanía sin compromiso — cada rueda es el resultado de…»]
              </p>
            </div>
            <div className="brand-value">
              <p className="brand-value__number">02</p>
              <h3 className="brand-value__title">[Valor 2]</h3>
              <p className="brand-value__text">[Descripción corta, 1–2 frases.]</p>
            </div>
            <div className="brand-value">
              <p className="brand-value__number">03</p>
              <h3 className="brand-value__title">[Valor 3]</h3>
              <p className="brand-value__text">[Descripción corta, 1–2 frases.]</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4 · La comunidad */}
      <section className="section" aria-label="La comunidad">
        <div className="container" style={{ textAlign: 'center' }}>
          <span className="eyebrow">La comunidad</span>
          <h2 style={{ marginBottom: 'var(--space-5)' }}>¿Qué es The Dynasty?</h2>
          <p style={{ marginInline: 'auto', marginBottom: 'var(--space-6)', maxWidth: '60ch' }}>
            [Definir si The Dynasty es un club, una comunidad de usuarios, un equipo
            embajador — o las tres cosas. Cómo puede alguien unirse: proceso,
            formulario o red social.]
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button href="/contacto" variant="primary" size="large">
              Únete a la Dynasty
            </Button>
          </div>
        </div>
      </section>

      {/* 5 · Manifiesto de cierre (componente 20) */}
      <section className="section section--elevated" aria-label="Manifiesto">
        <div className="container">
          <hr className="sep-line" style={{ marginBottom: 'var(--sp-8)' }} />
          <div className="manifesto">
            <span className="script">The Dynasty</span>
            <p>
              [Manifiesto de cierre — 2 a 4 frases. El texto que define SAMORAI en
              pocas palabras. Extraer del manifiesto existente o redactar versión final.]
            </p>
            <span className="by">— SAMORAI</span>
          </div>
        </div>
      </section>
    </>
  );
}
