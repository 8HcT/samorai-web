import type { Route } from './+types/support';
import { seoMeta, seoStrings } from '~/lib/seo';
import { useEffect } from 'react';
import { Form, useActionData, useNavigation } from 'react-router';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { SectionHeader } from '~/components/SectionHeader';
import { Button } from '~/components/Button';
import { sendContactEmail } from '~/lib/email/email.server';
import { useT } from '~/i18n/useT';

export function meta(args: Route.MetaArgs) {
  const s = seoStrings(args).contact;
  return seoMeta(args, { title: s.title, description: s.description });
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
    return { ok: false as const, error: 'missing' as const };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false as const, error: 'email' as const };
  }

  const res = await sendContactEmail({ name, email, subject, message });
  if (!res.ok) return { ok: false as const, error: 'send' as const };
  return { ok: true as const };
}

export default function Support() {
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';
  const c = useT().contact;
  const errorText = { missing: c.errorMissing, email: c.errorEmail, send: c.errorSend };

  useEffect(() => {
    trackEvent('support_page_viewed', {});
  }, []);

  return (
    <>
      {/* 1 · CTA de contacto (arriba) */}
      <section className="section" aria-label={c.eyebrow}>
        <div className="container">
          <SectionHeader eyebrow={c.eyebrow} title={c.title} subtitle={c.subtitle} as="h1" />

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
                <strong>{c.sentTitle}</strong> {c.sentBody}
              </p>
            ) : (
              <Form
                method="post"
                aria-label={c.formAria}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}
              >
                {actionData?.error && (
                  <p className="cart-error" role="alert">{errorText[actionData.error]}</p>
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
                  <label htmlFor="cf-name">{c.name}</label>
                  <input id="cf-name" name="name" type="text" required className="s-input" placeholder={c.namePlaceholder} autoComplete="name" />
                </div>

                <div className="field-group" style={{ maxWidth: 'none' }}>
                  <label htmlFor="cf-email">{c.email}</label>
                  <input id="cf-email" name="email" type="email" required className="s-input" placeholder={c.emailPlaceholder} autoComplete="email" />
                </div>

                <div className="field-group" style={{ maxWidth: 'none' }}>
                  <label htmlFor="cf-subject">{c.subject}</label>
                  <div className="s-select" style={{ maxWidth: 'none' }}>
                    <select id="cf-subject" name="subject" defaultValue="">
                      <option value="">{c.subjectPlaceholder}</option>
                      {c.subjects.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <span className="chev" aria-hidden="true">▾</span>
                  </div>
                </div>

                <div className="field-group" style={{ maxWidth: 'none' }}>
                  <label htmlFor="cf-message">{c.message}</label>
                  <textarea id="cf-message" name="message" required className="s-input" rows={4} placeholder={c.messagePlaceholder} style={{ resize: 'vertical' }} />
                </div>

                <Button type="submit" variant="primary" disabled={submitting}>
                  {submitting ? c.sending : c.send}
                </Button>
              </Form>
            )}
          </div>
        </div>
      </section>

      {/* 2 · Preguntas frecuentes (abajo) */}
      <section className="section section--elevated" aria-label={c.faqEyebrow}>
        <div className="container">
          <SectionHeader eyebrow={c.faqEyebrow} title={c.faqTitle} />

          <div className="faq-list" role="list">
            {c.faq.map((item, i) => (
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
