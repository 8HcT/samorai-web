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
import type { OrderAddress, OrderRecord } from '~/lib/orders/orders.server';
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

const GOLD = '#D7B55B';
const INK = '#1d1d1d';

/**
 * Lista de destinatarios a partir de una variable de entorno. Admite varias
 * direcciones separadas por comas, para que el aviso llegue a todo el equipo
 * que gestiona pedidos (p. ej. "pedidos@…, administracion@…").
 */
function recipients(name: string): string[] {
  return (env(name) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Datos de una línea desglosados (modelo, acabado, medida, ET, referencia). */
function lineDetails(variantId: string) {
  const found = getVariantById(variantId);
  if (!found) {
    return { title: variantId, finish: null, size: null, et: null, ref: variantId };
  }
  const { product, variant } = found;
  return {
    title: product.name,
    finish: getFinish(product, variant.finishId)?.name ?? variant.color,
    size: formatSize(variant.diameter, variant.width),
    et: formatEt(variant.et),
    ref: variant.id,
  };
}

/** Referencia corta y legible del pedido, a partir del id de sesión. */
function orderRef(order: OrderRecord): string {
  return order.stripeSessionId.slice(-8).toUpperCase();
}

/** Nº total de llantas del pedido. */
function totalUnits(order: OrderRecord): number {
  return order.lines.reduce((sum, l) => sum + l.quantity, 0);
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Europe/Madrid',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Nombre del país a partir del código ISO que devuelve Stripe ("ES" → "España").
 * Se usa `Intl.DisplayNames` para no mantener una lista a mano.
 */
function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Dirección en varias líneas, lista para copiar en una etiqueta de envío. */
function addressHtml(address: OrderAddress | null): string {
  if (!address) return '<span style="color:#999;">No facilitada</span>';
  const region = [address.postalCode, address.city].filter(Boolean).join(' ');
  // La provincia solo aporta si no repite la ciudad (Madrid, Madrid…).
  const state =
    address.state && address.state.trim().toLowerCase() !== (address.city ?? '').trim().toLowerCase()
      ? address.state
      : null;
  const parts = [
    address.name,
    address.line1,
    address.line2,
    region,
    state,
    countryName(address.country),
  ].filter((p): p is string => Boolean(p && p.trim()));
  return parts.map(esc).join('<br>');
}

function rowsHtml(order: OrderRecord): string {
  return order.lines
    .map((l) => {
      const d = lineDetails(l.variantId);
      const lineTotal = formatPrice(l.unitPriceCents * l.quantity);
      const specs = [
        d.finish && `Acabado: ${d.finish}`,
        d.size && `Medida: ${d.size}`,
        d.et && `Offset: ${d.et}`,
      ]
        .filter(Boolean)
        .map((s) => esc(String(s)))
        .join(' &nbsp;·&nbsp; ');
      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #eee;color:${INK};font-size:14px;">
            <strong style="font-size:15px;">${esc(d.title)}</strong><br>
            <span style="color:#555;font-size:13px;line-height:1.7;">${specs}</span><br>
            <span style="color:#999;font-size:11px;">Ref. ${esc(d.ref)}</span><br>
            <span style="color:#888;font-size:12px;">${l.quantity} ${l.quantity === 1 ? 'unidad' : 'unidades'} × ${formatPrice(l.unitPriceCents)}</span>
          </td>
          <td style="padding:14px 0;border-bottom:1px solid #eee;text-align:right;color:${INK};font-size:14px;font-weight:600;white-space:nowrap;vertical-align:top;">
            ${lineTotal}
          </td>
        </tr>`;
    })
    .join('');
}

/** Bloque de dos columnas con envío y contacto. */
function detailsHtml(order: OrderRecord, opts: { showBilling: boolean }): string {
  const billingDiffers =
    opts.showBilling &&
    order.billingAddress != null &&
    JSON.stringify(order.billingAddress) !== JSON.stringify(order.shippingAddress);

  return `
    <table style="width:100%;border-collapse:collapse;margin:22px 0 0;">
      <tr>
        <td style="vertical-align:top;padding:0 12px 0 0;width:50%;">
          <p style="margin:0 0 6px;color:#888;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Dirección de envío</p>
          <p style="margin:0;color:${INK};font-size:13px;line-height:1.7;">${addressHtml(order.shippingAddress)}</p>
        </td>
        <td style="vertical-align:top;padding:0 0 0 12px;width:50%;">
          <p style="margin:0 0 6px;color:#888;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Contacto</p>
          <p style="margin:0;color:${INK};font-size:13px;line-height:1.7;">
            ${order.customerName ? `${esc(order.customerName)}<br>` : ''}
            ${order.customerEmail ? `${esc(order.customerEmail)}<br>` : ''}
            ${order.customerPhone ? esc(order.customerPhone) : ''}
          </p>
        </td>
      </tr>
      ${
        billingDiffers
          ? `<tr>
               <td colspan="2" style="padding:18px 0 0;">
                 <p style="margin:0 0 6px;color:#888;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Dirección de facturación</p>
                 <p style="margin:0;color:${INK};font-size:13px;line-height:1.7;">${addressHtml(order.billingAddress)}</p>
               </td>
             </tr>`
          : ''
      }
    </table>`;
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

/** Cabecera: referencia, fecha y nº de llantas. */
function summaryHtml(order: OrderRecord): string {
  const units = totalUnits(order);
  return `
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;background:#fafafa;border:1px solid #eee;">
      <tr>
        <td style="padding:12px 14px;color:#888;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Pedido</td>
        <td style="padding:12px 14px;color:${INK};font-size:13px;font-weight:700;text-align:right;">#${esc(orderRef(order))}</td>
      </tr>
      <tr>
        <td style="padding:0 14px 12px;color:#888;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Fecha</td>
        <td style="padding:0 14px 12px;color:${INK};font-size:13px;text-align:right;">${esc(formatDate(order.createdAt))}</td>
      </tr>
      <tr>
        <td style="padding:0 14px 12px;color:#888;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Unidades</td>
        <td style="padding:0 14px 12px;color:${INK};font-size:13px;text-align:right;">${units} ${units === 1 ? 'llanta' : 'llantas'}</td>
      </tr>
    </table>`;
}

function orderTable(order: OrderRecord): string {
  const total = formatPrice(order.amountTotalCents);
  // El subtotal solo se muestra si aporta algo (si hay envío cobrado).
  const shipping = order.shippingCents;
  const showBreakdown = shipping != null && order.amountSubtotalCents != null;

  return `
    <table style="width:100%;border-collapse:collapse;margin:8px 0 4px;">
      ${rowsHtml(order)}
      ${
        showBreakdown
          ? `<tr>
               <td style="padding:14px 0 0;color:#666;font-size:13px;">Subtotal</td>
               <td style="padding:14px 0 0;text-align:right;color:#666;font-size:13px;">${formatPrice(order.amountSubtotalCents)}</td>
             </tr>
             <tr>
               <td style="padding:6px 0 0;color:#666;font-size:13px;">Envío</td>
               <td style="padding:6px 0 0;text-align:right;color:#666;font-size:13px;">${shipping === 0 ? 'Gratuito' : formatPrice(shipping)}</td>
             </tr>`
          : ''
      }
      <tr>
        <td style="padding:14px 0 0;color:${INK};font-size:15px;font-weight:700;">Total (IVA incluido)</td>
        <td style="padding:14px 0 0;text-align:right;color:${GOLD};font-size:18px;font-weight:700;">${total}</td>
      </tr>
    </table>`;
}

/** HTML del correo de confirmación que recibe el cliente. */
function customerEmailHtml(order: OrderRecord): string {
  const ref = orderRef(order);
  return shell(
    '¡Gracias por tu pedido!',
    `<p style="color:#444;font-size:14px;line-height:1.6;margin:0 0 16px;">
       Hemos recibido tu pago correctamente. Aquí tienes el resumen de tu compra:
     </p>
     ${summaryHtml(order)}${orderTable(order)}
     ${detailsHtml(order, { showBilling: true })}
     <p style="color:#888;font-size:12px;line-height:1.6;margin:22px 0 0;">
       Te contactaremos con los detalles del envío. Si algún dato de la dirección
       no es correcto, responde a este correo cuanto antes indicando la
       referencia <strong>#${esc(ref)}</strong>.
     </p>`
  );
}

/**
 * Bloque destacado con lo imprescindible para preparar el envío: qué se manda
 * y a dónde. Va arriba del todo en el aviso a la tienda para poder trabajar el
 * pedido sin abrir Stripe.
 */
function fulfilmentHtml(order: OrderRecord): string {
  const picking = order.lines
    .map((l) => {
      const d = lineDetails(l.variantId);
      return `<tr>
        <td style="padding:6px 10px 6px 0;color:${INK};font-size:16px;font-weight:700;white-space:nowrap;vertical-align:top;">${l.quantity}×</td>
        <td style="padding:6px 0;color:${INK};font-size:13px;line-height:1.6;">
          <strong>${esc(d.title)}${d.finish ? ` ${esc(d.finish)}` : ''}</strong><br>
          ${d.size ? esc(d.size) : ''}${d.et ? ` · ${esc(d.et)}` : ''}<br>
          <span style="color:#999;font-size:11px;">${esc(d.ref)}</span>
        </td>
      </tr>`;
    })
    .join('');

  return `
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border:2px solid ${INK};">
      <tr>
        <td style="padding:12px 14px;background:${INK};color:#fff;font-size:12px;letter-spacing:2px;text-transform:uppercase;">
          Preparar envío
        </td>
      </tr>
      <tr>
        <td style="padding:16px 14px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="vertical-align:top;width:52%;padding:0 12px 0 0;">
                <p style="margin:0 0 8px;color:#888;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Qué se manda</p>
                <table style="border-collapse:collapse;">${picking}</table>
              </td>
              <td style="vertical-align:top;width:48%;padding:0 0 0 12px;border-left:1px solid #eee;">
                <p style="margin:0 0 8px;color:#888;font-size:11px;letter-spacing:1px;text-transform:uppercase;">A dónde</p>
                <p style="margin:0 0 10px;color:${INK};font-size:13px;line-height:1.7;">${addressHtml(order.shippingAddress)}</p>
                ${
                  order.customerPhone
                    ? `<p style="margin:0;color:${INK};font-size:13px;">Tel. <strong>${esc(order.customerPhone)}</strong>
                         <span style="color:#999;font-size:11px;">(para la agencia)</span></p>`
                    : '<p style="margin:0;color:#c00;font-size:12px;">Sin teléfono de contacto</p>'
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

/** HTML del aviso interno de venta que recibe la tienda. */
function shopEmailHtml(order: OrderRecord): string {
  return shell(
    'Nueva venta',
    `${fulfilmentHtml(order)}
     ${summaryHtml(order)}${orderTable(order)}
     ${detailsHtml(order, { showBilling: true })}
     <p style="color:#999;font-size:11px;line-height:1.8;margin:24px 0 0;padding-top:14px;border-top:1px solid #eee;">
       Estado del pago: <strong>${esc(order.paymentStatus)}</strong><br>
       Sesión de Stripe: ${esc(order.stripeSessionId)}<br>
       ${
         order.stripePaymentIntentId
           ? `<a href="https://dashboard.stripe.com/payments/${esc(order.stripePaymentIntentId)}" style="color:${GOLD};">Ver el pago en Stripe →</a>`
           : ''
       }
     </p>`
  );
}

/**
 * Versión en texto plano del aviso de venta. Es lo que se ve al reenviarlo a
 * una agencia de transporte o al leerlo en un cliente que bloquea el HTML.
 */
function shopEmailText(order: OrderRecord): string {
  const address = order.shippingAddress;
  const region = [address?.postalCode, address?.city].filter(Boolean).join(' ');
  const lines = order.lines.map((l) => {
    const d = lineDetails(l.variantId);
    return `  ${l.quantity}x ${d.title}${d.finish ? ` ${d.finish}` : ''}${d.size ? ` ${d.size}` : ''}${d.et ? ` ${d.et}` : ''}\n     ref. ${d.ref} — ${formatPrice(l.unitPriceCents * l.quantity)}`;
  });

  return [
    `PEDIDO #${orderRef(order)}`,
    formatDate(order.createdAt),
    '',
    `ARTÍCULOS (${totalUnits(order)} llantas)`,
    ...lines,
    '',
    `TOTAL: ${formatPrice(order.amountTotalCents)} (IVA incluido)`,
    '',
    'ENVIAR A',
    ...[address?.name, address?.line1, address?.line2, region, address?.state, countryName(address?.country ?? null)]
      .filter(Boolean)
      .map((p) => `  ${p}`),
    order.customerPhone ? `  Tel. ${order.customerPhone}` : '  Sin teléfono',
    ...(order.customerEmail ? [`  ${order.customerEmail}`] : []),
    '',
    `Stripe: ${order.stripeSessionId}`,
  ].join('\n');
}

/** Vista previa (solo dev, ver `routes/api.email-preview.tsx`). */
export function renderOrderEmailPreview(
  order: OrderRecord,
  variant: 'customer' | 'shop'
): string {
  return variant === 'shop' ? shopEmailHtml(order) : customerEmailHtml(order);
}

export async function sendOrderEmails(order: OrderRecord): Promise<void> {
  const resend = getResend();
  const from = env('EMAIL_FROM');
  if (!resend || !from) return; // sin configurar → no-op silencioso

  const ref = orderRef(order);

  // 1 · Confirmación al cliente
  if (order.customerEmail) {
    try {
      await resend.emails.send({
        from,
        to: order.customerEmail,
        subject: `Tu pedido SAMORAI #${ref} · confirmado`,
        html: customerEmailHtml(order),
      });
    } catch (err) {
      console.error('[email] fallo enviando confirmación al cliente', err);
    }
  }

  // 2 · Aviso interno a la tienda (admite varios destinatarios)
  const shopTo = recipients('SHOP_ORDER_EMAIL');
  if (shopTo.length > 0) {
    try {
      await resend.emails.send({
        from,
        to: shopTo,
        // Responder al aviso escribe directamente al cliente.
        ...(order.customerEmail ? { replyTo: order.customerEmail } : {}),
        subject: `Nueva venta #${ref} · ${totalUnits(order)} llantas · ${formatPrice(order.amountTotalCents)}`,
        html: shopEmailHtml(order),
        // Texto plano: se lee bien en móvil, en clientes que bloquean HTML
        // y al reenviarlo a una agencia de transporte.
        text: shopEmailText(order),
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
  const configured = recipients('CONTACT_EMAIL');
  const to = configured.length > 0 ? configured : ['isainzmorales@samoraiwheels.com'];
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
