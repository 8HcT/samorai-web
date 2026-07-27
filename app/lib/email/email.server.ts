/**
 * Envío de correos de compra (solo servidor · Resend).
 *
 * Se dispara desde el webhook de Stripe tras `checkout.session.completed`.
 * Es best-effort: si Resend no está configurado (sin `RESEND_API_KEY` /
 * `EMAIL_FROM`) o falla el envío, NO se lanza error — el pedido ya está
 * registrado y el webhook debe responder 200. Los fallos se loguean.
 *
 * Config (.env):
 *   RESEND_API_KEY   secreta (dashboard de Resend)
 *   EMAIL_FROM       remitente, p.ej. "SAMORAI <pedidos@tudominio.com>"
 *                    (para pruebas vale "onboarding@resend.dev")
 *   SHOP_ORDER_EMAIL destino del aviso interno a la tienda (opcional)
 */
import { Resend } from 'resend';
import { env } from '~/lib/env.server';
import type { OrderRecord } from '~/lib/orders/orders.server';
import { getVariantById, getFinish } from '~/data/products';
import { formatPrice } from '~/lib/money';
import { formatSize, formatEt } from '~/lib/format';

let _resend: Resend | null = null;

function getResend(): Resend | null {
  const key = env('RESEND_API_KEY');
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

/** Detalle legible de una línea (acabado · medida · ET) desde su variantId. */
function describeLine(variantId: string): string {
  const found = getVariantById(variantId);
  if (!found) return variantId;
  const { product, variant } = found;
  const finishName = getFinish(product, variant.finishId)?.name ?? variant.color;
  return `${product.name} · ${finishName} · ${formatSize(variant.diameter, variant.width)} ${formatEt(variant.et)}`;
}

const GOLD = '#D7B55B';
const INK = '#1d1d1d';

function rowsHtml(order: OrderRecord): string {
  return order.lines
    .map((l) => {
      const desc = describeLine(l.variantId);
      const lineTotal = formatPrice(l.unitPriceCents * l.quantity);
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;color:${INK};font-size:14px;">
            ${desc}<br>
            <span style="color:#888;font-size:12px;">${l.quantity} × ${formatPrice(l.unitPriceCents)}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;color:${INK};font-size:14px;font-weight:600;white-space:nowrap;">
            ${lineTotal}
          </td>
        </tr>`;
    })
    .join('');
}

function shell(title: string, bodyHtml: string): string {
  return `
  <div style="background:#f4f4f4;padding:32px 0;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:${INK};padding:22px 28px;">
        <span style="color:#fff;font-size:18px;letter-spacing:4px;font-weight:700;">SAMORAI</span>
      </div>
      <div style="padding:28px;">
        <h1 style="margin:0 0 16px;font-size:20px;color:${INK};">${title}</h1>
        ${bodyHtml}
      </div>
      <div style="padding:18px 28px;background:#fafafa;border-top:1px solid #eee;color:#999;font-size:12px;">
        SAMORAI Wheels · Precio por llanta, IVA incluido.
      </div>
    </div>
  </div>`;
}

function orderTable(order: OrderRecord): string {
  const total = formatPrice(order.amountTotalCents);
  return `
    <table style="width:100%;border-collapse:collapse;margin:8px 0 4px;">
      ${rowsHtml(order)}
      <tr>
        <td style="padding:14px 0 0;color:${INK};font-size:15px;font-weight:700;">Total (IVA incluido)</td>
        <td style="padding:14px 0 0;text-align:right;color:${GOLD};font-size:18px;font-weight:700;">${total}</td>
      </tr>
    </table>`;
}

export async function sendOrderEmails(order: OrderRecord): Promise<void> {
  const resend = getResend();
  const from = env('EMAIL_FROM');
  if (!resend || !from) return; // sin configurar → no-op silencioso

  const table = orderTable(order);

  // 1 · Confirmación al cliente
  if (order.customerEmail) {
    try {
      await resend.emails.send({
        from,
        to: order.customerEmail,
        subject: 'Tu pedido SAMORAI · confirmado',
        html: shell(
          '¡Gracias por tu pedido!',
          `<p style="color:#444;font-size:14px;line-height:1.6;margin:0 0 12px;">
             Hemos recibido tu pago correctamente. Aquí tienes el resumen de tu compra:
           </p>${table}
           <p style="color:#888;font-size:12px;line-height:1.6;margin:18px 0 0;">
             Te contactaremos con los detalles de envío. Si tienes dudas, responde a este correo.
           </p>`
        ),
      });
    } catch (err) {
      console.error('[email] fallo enviando confirmación al cliente', err);
    }
  }

  // 2 · Aviso interno a la tienda
  const shopTo = env('SHOP_ORDER_EMAIL');
  if (shopTo) {
    try {
      await resend.emails.send({
        from,
        to: shopTo,
        subject: `Nueva venta · ${formatPrice(order.amountTotalCents)}`,
        html: shell(
          'Nueva venta',
          `<p style="color:#444;font-size:14px;line-height:1.6;margin:0 0 12px;">
             Cliente: <strong>${order.customerEmail ?? 'desconocido'}</strong><br>
             Sesión: ${order.stripeSessionId}
           </p>${table}`
        ),
      });
    } catch (err) {
      console.error('[email] fallo enviando aviso a la tienda', err);
    }
  }
}

/** Escapa el input del usuario para incrustarlo con seguridad en el HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Envía el mensaje del formulario de contacto a la dirección de la tienda
 * (`CONTACT_EMAIL`, por defecto isainzmorales@samoraiwheels.com), con
 * `replyTo` = email del remitente para poder responderle directamente.
 */
export async function sendContactEmail(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  const from = env('EMAIL_FROM');
  const to = env('CONTACT_EMAIL') || 'isainzmorales@samoraiwheels.com';
  if (!resend || !from) return { ok: false, error: 'not-configured' };

  try {
    await resend.emails.send({
      from,
      to,
      replyTo: input.email,
      subject: `Contacto web${input.subject ? ` · ${esc(input.subject)}` : ''} — ${esc(input.name)}`,
      html: shell(
        'Nuevo mensaje de contacto',
        `<p style="color:#444;font-size:14px;line-height:1.7;margin:0 0 14px;">
           <strong>Nombre:</strong> ${esc(input.name)}<br>
           <strong>Email:</strong> ${esc(input.email)}<br>
           ${input.subject ? `<strong>Asunto:</strong> ${esc(input.subject)}<br>` : ''}
         </p>
         <p style="color:${INK};font-size:14px;line-height:1.7;white-space:pre-wrap;margin:0;">${esc(input.message)}</p>`
      ),
    });
    return { ok: true };
  } catch (err) {
    console.error('[email] fallo enviando contacto', err);
    return { ok: false, error: 'send-failed' };
  }
}
