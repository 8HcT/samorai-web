import type { Route } from './+types/support';
import { useEffect } from 'react';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { SectionHeader } from '~/components/SectionHeader';
import { Button } from '~/components/Button';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Contacto — SAMORAI Wheels' },
    { name: 'description', content: 'Contacta con SAMORAI — asistencia de fitment, consultas de pedido, preguntas técnicas y formulario de contacto.' },
  ];
}

const FAQ_ITEMS = [
  {
    q: 'How do I know if Victoria wheels fit my car?',
    a: 'You need to verify PCD (bolt pattern), center bore, offset (ET) range, wheel diameter clearance, and brake caliper clearance. The Victoria is currently available in 5×120 PCD with a 72.6mm center bore and ET35 or ET45 options. If your vehicle has a different hub diameter, SAMORAI hub rings can adapt the center bore. Always consult your vehicle handbook or a specialist before purchasing.',
  },
  {
    q: 'What are hub rings and do I need them?',
    a: 'Hub rings fill the gap between the wheel\'s center bore and your vehicle\'s hub spigot diameter. If your hub OD is smaller than 72.6mm, hub rings are required for a hub-centric fit. Without them, the wheel is only centered by the bolts, which can cause vibration at speed. SAMORAI custom hub rings are coming soon — contact us to register interest.',
  },
  {
    q: 'What sizes are available for the Victoria?',
    a: 'The Victoria is currently available in 18″ diameter with widths of 8.5J, 9J, and 9.5J. ET options are ET35 and ET45 depending on the variant. Three finishes are available: Anthracite Grey, Black Metallic, and Silver Metallic. See the wheels page for the full variant table.',
  },
  {
    q: 'How do I place an order or request a price?',
    a: 'Checkout is not yet active on the website. You can use the contact form below or the "Request Quote" button on the product page to register your interest. We will respond with pricing and availability information.',
  },
  {
    q: 'What is the load rating and why does it matter?',
    a: 'The Victoria is rated at 650kg per wheel. This means each wheel can safely carry up to 650kg of vehicle load under normal driving conditions. You must confirm that this exceeds the maximum axle load of your vehicle divided by the wheel count on that axle. Load rating is a safety specification.',
  },
  {
    q: 'Can I use Victoria wheels on a track or motorsport application?',
    a: 'The Victoria is designed for road use. If you are considering track or motorsport use, contact us to discuss your application. Additional considerations apply for load cycles, thermal conditions, and regulatory requirements in competition contexts.',
  },
  {
    q: 'What is the warranty on SAMORAI wheels?',
    a: 'Warranty terms are being finalized and will be published before the first commercial orders are processed. Contact us for current information.',
  },
  {
    q: 'Do you ship internationally?',
    a: 'Shipping regions and logistics arrangements are being confirmed. Contact us with your location and we will advise on availability for your market.',
  },
];

export default function Support() {
  useEffect(() => {
    trackEvent('support_page_viewed', {});
  }, []);

  return (
    <>
      {/* Hero */}
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow">Soporte y contacto</span>
          <h1>Contacto</h1>
          <p className="page-hero__subtitle">
            Asistencia de fitment, consultas de pedido, preguntas técnicas y soporte general.
          </p>
        </div>
      </div>

      <section className="section" aria-label="Support main">
        <div className="container">
          <div className="support-layout">
            {/* FAQ */}
            <div>
              <SectionHeader
                eyebrow="Frequently Asked"
                title="Common Questions"
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

            {/* Contact form */}
            <div className="contact-card">
              <h3>Get in Touch</h3>

              <form
                onSubmit={(e) => e.preventDefault()}
                aria-label="Contact form"
                noValidate
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}
              >
                <div className="field-group" style={{ maxWidth: 'none' }}>
                  <label htmlFor="cf-name">Name</label>
                  <input
                    id="cf-name"
                    type="text"
                    className="s-input"
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </div>

                <div className="field-group" style={{ maxWidth: 'none' }}>
                  <label htmlFor="cf-email">Email</label>
                  <input
                    id="cf-email"
                    type="email"
                    className="s-input"
                    placeholder="your@email.com"
                    autoComplete="email"
                  />
                </div>

                <div className="field-group" style={{ maxWidth: 'none' }}>
                  <label htmlFor="cf-subject">Topic</label>
                  <div className="s-select" style={{ maxWidth: 'none' }}>
                    <select id="cf-subject">
                      <option value="">Select a topic</option>
                      <option value="fitment">Fitment / Compatibility</option>
                      <option value="order">Order / Pricing</option>
                      <option value="dealer">Dealer Enquiry</option>
                      <option value="hub-rings">Hub Rings</option>
                      <option value="technical">Technical Question</option>
                      <option value="other">Other</option>
                    </select>
                    <span className="chev" aria-hidden="true">▾</span>
                  </div>
                </div>

                <div className="field-group" style={{ maxWidth: 'none' }}>
                  <label htmlFor="cf-message">Message</label>
                  <textarea
                    id="cf-message"
                    className="s-input"
                    rows={4}
                    placeholder="Describe your question or request..."
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <Button type="submit" variant="primary" disabled>
                  Send Message
                </Button>

                <p className="caption" style={{ textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                  Form submission not yet active
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
