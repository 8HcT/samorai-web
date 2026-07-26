import type { Route } from './+types/support';
import { useEffect } from 'react';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { SectionHeader } from '~/components/SectionHeader';
import { Button } from '~/components/Button';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Contacto | SAMORAI' },
    { name: 'description', content: 'Contacta con SAMORAI — asistencia de fitment, consultas de pedido, preguntas técnicas y formulario de contacto.' },
  ];
}

const FAQ_ITEMS = [
  {
    q: '¿Cómo sé si las llantas Victoria encajan en mi coche?',
    a: 'Debes verificar el PCD (patrón de tornillos), el buje central, el rango de offset (ET), la holgura del diámetro de la llanta y la holgura de la pinza de freno. La Victoria está disponible actualmente en PCD 5×120 con un buje central de 72,6 mm y opciones ET35 o ET45. Si tu vehículo tiene un diámetro de buje distinto, los anillos de centrado SAMORAI pueden adaptar el buje central. Consulta siempre el manual de tu vehículo o a un especialista antes de comprar.',
  },
  {
    q: '¿Qué son los anillos de centrado y los necesito?',
    a: 'Los anillos de centrado rellenan el hueco entre el buje central de la llanta y el diámetro del cubo de tu vehículo. Si el diámetro exterior de tu cubo es menor de 72,6 mm, los anillos de centrado son necesarios para un ajuste hub-centric. Sin ellos, la llanta solo se centra por los tornillos, lo que puede provocar vibraciones a alta velocidad. Los anillos de centrado a medida de SAMORAI llegarán pronto — contáctanos para registrar tu interés.',
  },
  {
    q: '¿Qué medidas hay disponibles para la Victoria?',
    a: 'La Victoria está disponible actualmente en diámetro de 18″ con anchos de 8,5J, 9J y 9,5J. Las opciones de ET son ET35 y ET45 según la variante. Hay tres acabados disponibles: Antracita Grey, Black Metallic y Silver Metallic. Consulta la página de llantas para ver todas las combinaciones.',
  },
  {
    q: '¿Cómo hago un pedido o pido precio?',
    a: 'Elige el acabado en la página de producto, configura la medida y el ET, y añade la llanta al carrito. El precio (IVA incluido) se muestra en el carrito y el pago se procesa de forma segura con Stripe. Si tienes dudas sobre disponibilidad o compatibilidad, escríbenos con el formulario de arriba.',
  },
  {
    q: '¿Cuál es la capacidad de carga y por qué importa?',
    a: 'La Victoria tiene una capacidad de 650 kg por llanta. Esto significa que cada llanta puede soportar con seguridad hasta 650 kg de carga del vehículo en condiciones normales de conducción. Debes confirmar que este valor supera la carga máxima por eje de tu vehículo dividida entre el número de ruedas de ese eje. La capacidad de carga es una especificación de seguridad.',
  },
  {
    q: '¿Puedo usar las llantas Victoria en circuito o competición?',
    a: 'La Victoria está diseñada para uso en carretera. Si estás considerando un uso en circuito o competición, contáctanos para hablar de tu aplicación. Hay consideraciones adicionales sobre ciclos de carga, condiciones térmicas y requisitos normativos en contextos de competición.',
  },
  {
    q: '¿Cuál es la garantía de las llantas SAMORAI?',
    a: 'Las condiciones de garantía se están finalizando y se publicarán antes de procesar los primeros pedidos comerciales. Contáctanos para obtener información actualizada.',
  },
  {
    q: '¿Hacéis envíos internacionales?',
    a: 'Las regiones de envío y la logística se están confirmando. Escríbenos con tu ubicación y te informaremos sobre la disponibilidad para tu mercado.',
  },
];

export default function Support() {
  useEffect(() => {
    trackEvent('support_page_viewed', {});
  }, []);

  return (
    <>
      {/* 1 · CTA de contacto (arriba) */}
      <section className="section" aria-label="Contacto">
        <div className="container">
          <SectionHeader
            eyebrow="Soporte y contacto"
            title="Ponte en contacto"
            subtitle="Asistencia de fitment, consultas de pedido, preguntas técnicas y soporte general."
          />

          <div className="contact-card contact-card--top">
            <form
              onSubmit={(e) => e.preventDefault()}
              aria-label="Formulario de contacto"
              noValidate
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}
            >
              <div className="field-group" style={{ maxWidth: 'none' }}>
                <label htmlFor="cf-name">Nombre</label>
                <input
                  id="cf-name"
                  type="text"
                  className="s-input"
                  placeholder="Tu nombre"
                  autoComplete="name"
                />
              </div>

              <div className="field-group" style={{ maxWidth: 'none' }}>
                <label htmlFor="cf-email">Email</label>
                <input
                  id="cf-email"
                  type="email"
                  className="s-input"
                  placeholder="tu@email.com"
                  autoComplete="email"
                />
              </div>

              <div className="field-group" style={{ maxWidth: 'none' }}>
                <label htmlFor="cf-subject">Asunto</label>
                <div className="s-select" style={{ maxWidth: 'none' }}>
                  <select id="cf-subject">
                    <option value="">Selecciona un tema</option>
                    <option value="fitment">Fitment / Compatibilidad</option>
                    <option value="order">Pedido / Precio</option>
                    <option value="dealer">Consulta de distribuidor</option>
                    <option value="hub-rings">Anillos de centrado</option>
                    <option value="technical">Pregunta técnica</option>
                    <option value="other">Otro</option>
                  </select>
                  <span className="chev" aria-hidden="true">▾</span>
                </div>
              </div>

              <div className="field-group" style={{ maxWidth: 'none' }}>
                <label htmlFor="cf-message">Mensaje</label>
                <textarea
                  id="cf-message"
                  className="s-input"
                  rows={4}
                  placeholder="Describe tu consulta o solicitud..."
                  style={{ resize: 'vertical' }}
                />
              </div>

              <Button type="submit" variant="primary" disabled>
                Enviar mensaje
              </Button>

              <p className="caption" style={{ textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                El envío del formulario aún no está activo
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* 2 · Preguntas frecuentes (abajo) */}
      <section className="section section--elevated" aria-label="Preguntas frecuentes">
        <div className="container">
          <SectionHeader
            eyebrow="Preguntas frecuentes"
            title="Dudas habituales"
          />

          <div className="faq-list" role="list">
            {FAQ_ITEMS.map((item, i) => (
              <details key={i} className="faq-item" role="listitem">
                <summary>{item.q}</summary>
                <p className="faq-item__body">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
