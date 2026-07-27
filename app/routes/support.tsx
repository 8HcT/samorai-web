import type { Route } from './+types/support';
import { useEffect } from 'react';
import { Form, useActionData, useNavigation } from 'react-router';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { SectionHeader } from '~/components/SectionHeader';
import { Button } from '~/components/Button';
import { sendContactEmail } from '~/lib/email/email.server';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Contacto | SAMORAI' },
    { name: 'description', content: 'Contacta con SAMORAI — asistencia de fitment, consultas de pedido, preguntas técnicas y formulario de contacto.' },
  ];
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();

  // Honeypot: si el campo oculto viene relleno es un bot → fingir éxito.
  if (String(form.get('company') || '').trim() !== '') return { ok: true as const };

  const name = String(form.get('name') || '').trim();
  const email = String(form.get('email') || '').trim();
  const subject = String(form.get('subject') || '').trim();
  const message = String(form.get('message') || '').trim();

  if (!name || !email || !message) {
    return { ok: false as const, error: 'Rellena tu nombre, email y mensaje.' };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false as const, error: 'Introduce un email válido.' };
  }

  const res = await sendContactEmail({ name, email, subject, message });
  if (!res.ok) {
    return {
      ok: false as const,
      error:
        'No se pudo enviar el mensaje. Inténtalo más tarde o escríbenos a isainzmorales@samoraiwheels.com.',
    };
  }
  return { ok: true as const };
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
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';

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
            {actionData?.ok ? (
              <p
                role="status"
                style={{
                  borderLeft: '3px solid var(--color-success)',
                  background: 'var(--gold-10)',
                  color: 'var(--color-text-primary)',
                  padding: 'var(--space-5) var(--space-6)',
                  fontSize: 'var(--text-sm)',
                  lineHeight: 'var(--leading-relaxed)',
                }}
              >
                <strong>¡Mensaje enviado!</strong> Gracias por escribirnos. Te responderemos lo antes posible.
              </p>
            ) : (
              <Form
                method="post"
                aria-label="Formulario de contacto"
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}
              >
                {actionData?.error && (
                  <p className="cart-error" role="alert">{actionData.error}</p>
                )}

                {/* honeypot anti-spam (oculto para usuarios) */}
                <input
                  type="text"
                  name="company"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
                />

                <div className="field-group" style={{ maxWidth: 'none' }}>
                  <label htmlFor="cf-name">Nombre</label>
                  <input id="cf-name" name="name" type="text" required className="s-input" placeholder="Tu nombre" autoComplete="name" />
                </div>

                <div className="field-group" style={{ maxWidth: 'none' }}>
                  <label htmlFor="cf-email">Email</label>
                  <input id="cf-email" name="email" type="email" required className="s-input" placeholder="tu@email.com" autoComplete="email" />
                </div>

                <div className="field-group" style={{ maxWidth: 'none' }}>
                  <label htmlFor="cf-subject">Asunto</label>
                  <div className="s-select" style={{ maxWidth: 'none' }}>
                    <select id="cf-subject" name="subject" defaultValue="">
                      <option value="">Selecciona un tema</option>
                      <option value="Fitment / Compatibilidad">Fitment / Compatibilidad</option>
                      <option value="Pedido / Precio">Pedido / Precio</option>
                      <option value="Consulta de distribuidor">Consulta de distribuidor</option>
                      <option value="Anillos de centrado">Anillos de centrado</option>
                      <option value="Pregunta técnica">Pregunta técnica</option>
                      <option value="Otro">Otro</option>
                    </select>
                    <span className="chev" aria-hidden="true">▾</span>
                  </div>
                </div>

                <div className="field-group" style={{ maxWidth: 'none' }}>
                  <label htmlFor="cf-message">Mensaje</label>
                  <textarea id="cf-message" name="message" required className="s-input" rows={4} placeholder="Describe tu consulta o solicitud..." style={{ resize: 'vertical' }} />
                </div>

                <Button type="submit" variant="primary" disabled={submitting}>
                  {submitting ? 'Enviando…' : 'Enviar mensaje'}
                </Button>
              </Form>
            )}
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
