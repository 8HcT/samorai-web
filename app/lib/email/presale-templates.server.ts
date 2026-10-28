/**
 * Plantillas de correo de preventa, venta directa y pedidos (solo servidor).
 *
 * Usan la misma maqueta de marca que los correos de compra (`shell` de
 * email.server.ts). Todo dato que viene del cliente o de la base de datos
 * pasa por `esc()`. Las fechas se muestran en hora de Madrid indicándolo
 * expresamente (en la web se muestran en la zona horaria del navegador).
 *
 * Plantillas de cliente:
 *   reservation_confirmed · deposit_receipt · launch_announcement ·
 *   balance_request · balance_reminder · expiry_warning · reservation_expired ·
 *   balance_paid · direct_purchase · reservation_cancelled · refund_issued ·
 *   order_status_update
 * Avisos internos (SHOP_ORDER_EMAIL):
 *   shop_new_reservation · shop_balance_paid · shop_direct_sale · shop_review_needed
 */
import { formatEt, formatSize } from '~/lib/format';
import { formatPrice } from '~/lib/money';
import { formatPercentFromBps } from '~/lib/presale/pricing';
import { DEPOSIT_STATUS_LABEL, ORDER_STATUS_LABEL, label } from '~/lib/presale/labels';
import type { AddressJson, NotificationContext, ReservationRow } from '~/lib/presale/rows';
import { addressHtml, esc, GOLD, INK, shell } from './email.server';

/** Maqueta de marca con el pie propio de la preventa (importes por juego). */
function presaleShell(title: string, bodyHtml: string): string {
  return shell(title, bodyHtml, 'SAMORAI Wheels · Todos los importes incluyen IVA.');
}

export interface EmailLinks {
  site: string;
  reservation: string | null;
  order: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

// ------------------------------------------------------------------
// Formato
// ------------------------------------------------------------------

const MADRID_DATETIME = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
});
const DATE_ONLY = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'UTC' });

export function madridDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${MADRID_DATETIME.format(new Date(iso))} (hora de Madrid)`;
}

function dateOnly(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  return DATE_ONLY.format(new Date(`${isoDate.slice(0, 10)}T12:00:00Z`));
}

function daysLeft(dueIso: string | null, now: Date): number {
  if (!dueIso) return 0;
  return Math.max(0, Math.ceil((new Date(dueIso).getTime() - now.getTime()) / 86_400_000));
}

function sizeOf(r: { diameter: number | string; width: number | string }): string {
  return formatSize(Number(r.diameter), Number(r.width));
}

function p(text: string): string {
  return `<p style="color:#444;font-size:14px;line-height:1.65;margin:0 0 14px;">${text}</p>`;
}

function small(text: string): string {
  return `<p style="color:#888;font-size:12px;line-height:1.6;margin:18px 0 0;">${text}</p>`;
}

function button(href: string, text: string): string {
  return `
    <p style="margin:22px 0;">
      <a href="${esc(href)}" style="display:inline-block;background:${GOLD};color:${INK};text-decoration:none;font-weight:700;font-size:14px;letter-spacing:1px;text-transform:uppercase;padding:14px 26px;border-radius:4px;">${esc(text)}</a>
    </p>
    <p style="color:#999;font-size:11px;line-height:1.5;margin:0 0 14px;word-break:break-all;">Si el botón no funciona, copia este enlace: ${esc(href)}</p>`;
}

function rows(pairs: [string, string, boolean?][]): string {
  return `
    <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">
      ${pairs
        .map(
          ([k, v, strong]) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;color:#777;font-size:13px;">${esc(k)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;color:${strong ? GOLD : INK};font-size:${strong ? '16px' : '13px'};font-weight:${strong ? 700 : 600};text-align:right;">${esc(v)}</td>
        </tr>`
        )
        .join('')}
    </table>`;
}

function heading(text: string): string {
  return `<p style="margin:22px 0 8px;color:#888;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${esc(text)}</p>`;
}

function configRows(r: ReservationRow): string {
  return rows([
    ['Reserva', r.code],
    ['Modelo', r.product_name],
    ['Acabado', r.finish_name],
    ['Medida', `${sizeOf(r)}″`],
    ['Offset', formatEt(r.et)],
    ['Anclaje / buje', `${r.pcd} · ${String(r.center_bore).replace('.', ',')} mm`],
    ['Cantidad', `${r.quantity_sets} ${r.quantity_sets === 1 ? 'juego' : 'juegos'} (${r.quantity_sets * r.units_per_set} llantas)`],
  ]);
}

function priceRows(r: ReservationRow, opts: { paidInFull?: boolean } = {}): string {
  const pairs: [string, string, boolean?][] = [
    ['Precio original', formatPrice(r.subtotal_cents)],
  ];
  if (r.discount_cents > 0) {
    pairs.push([`Descuento de preventa (${formatPercentFromBps(r.discount_bps)})`, `−${formatPrice(r.discount_cents)}`]);
  }
  pairs.push(['Precio final (IVA incluido)', formatPrice(r.total_cents)]);
  pairs.push(['Reserva abonada', `−${formatPrice(r.deposit_cents)}`]);
  pairs.push(
    opts.paidInFull
      ? ['Pagado en total', formatPrice(r.total_cents), true]
      : ['Importe pendiente', formatPrice(r.balance_cents), true]
  );
  return rows(pairs);
}

function batchLine(ctx: NotificationContext): string {
  const b = ctx.batch;
  const snap = ctx.reservation?.terms_snapshot;
  const name = b?.name ?? snap?.batch_name ?? 'Tirada de fabricación';
  const delivery = dateOnly(b?.estimated_delivery_on ?? snap?.estimated_delivery_on ?? null);
  const note = b?.estimated_delivery_note ?? snap?.estimated_delivery_note ?? null;
  const bits = [`Tirada: <strong>${esc(name)}</strong>`];
  if (b?.planned_launch_at && !b.launched_at) bits.push(`Lanzamiento previsto: ${esc(madridDateTime(b.planned_launch_at))}`);
  if (delivery || note) bits.push(`Entrega estimada: ${esc([delivery, note].filter(Boolean).join(' · '))}`);
  return p(bits.join('<br>'));
}

function termsBlock(r: ReservationRow): string {
  const t = r.terms_snapshot ?? {};
  const sections: [string, string | null | undefined][] = [
    ['Condiciones de reserva', t.reservation_terms],
    ['Cancelación', t.cancellation_policy],
    ['Devoluciones', t.refund_policy],
    ['Caducidad de la reserva', t.expiry_policy],
  ];
  const body = sections
    .filter(([, text]) => text && text.trim())
    .map(
      ([title, text]) => `
      <p style="margin:12px 0 4px;color:${INK};font-size:12px;font-weight:700;">${esc(title)}</p>
      <p style="margin:0;color:#666;font-size:12px;line-height:1.6;white-space:pre-wrap;">${esc(String(text))}</p>`
    )
    .join('');
  if (!body) return '';
  return `
    <div style="margin:24px 0 0;padding:14px 16px;background:#fafafa;border:1px solid #eee;">
      <p style="margin:0;color:#888;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Condiciones que aceptaste al reservar</p>
      ${body}
    </div>`;
}

function deadlineBlock(r: ReservationRow, now: Date): string {
  if (!r.balance_due_at) return '';
  const n = daysLeft(r.balance_due_at, now);
  return `
    <div style="margin:0 0 18px;padding:14px 16px;border:2px solid ${GOLD};">
      <p style="margin:0;color:${INK};font-size:13px;line-height:1.6;">
        Fecha límite de pago: <strong>${esc(madridDateTime(r.balance_due_at))}</strong><br>
        <span style="color:#777;">${n === 1 ? 'Queda 1 día' : `Quedan ${n} días`} para completar el pago.</span>
      </p>
    </div>`;
}

function addressBlock(address: AddressJson | null): string {
  if (!address) return '';
  return `${heading('Dirección de envío')}<p style="margin:0 0 14px;color:${INK};font-size:13px;line-height:1.7;">${addressHtml({
    name: address.name ?? null,
    line1: address.line1 ?? null,
    line2: address.line2 ?? null,
    postalCode: address.postalCode ?? null,
    city: address.city ?? null,
    state: address.state ?? null,
    country: address.country ?? null,
  })}</p>`;
}

function orderItemsRows(ctx: NotificationContext): string {
  return rows(
    ctx.order_items.map((i) => [
      `${i.product_name}${i.finish_name ? ` ${i.finish_name}` : ''}${
        i.diameter != null && i.width != null ? ` ${formatSize(Number(i.diameter), Number(i.width))}` : ''
      }${i.et != null ? ` ${formatEt(i.et)}` : ''} · ${i.quantity} llantas`,
      formatPrice(i.unit_price_cents * i.quantity),
    ])
  );
}

function plainLines(lines: (string | null | undefined | false)[]): string {
  return lines.filter((l): l is string => typeof l === 'string').join('\n');
}

function reservationText(r: ReservationRow): string[] {
  return [
    `Reserva: ${r.code}`,
    `${r.product_name} ${r.finish_name} · ${sizeOf(r)} ${formatEt(r.et)} · ${r.quantity_sets} juego(s)`,
    `Precio original: ${formatPrice(r.subtotal_cents)}`,
    r.discount_cents > 0 ? `Descuento de preventa: −${formatPrice(r.discount_cents)}` : '',
    `Precio final (IVA incluido): ${formatPrice(r.total_cents)}`,
    `Reserva abonada: ${formatPrice(r.deposit_cents)}`,
    `Importe pendiente: ${formatPrice(r.balance_cents)}`,
  ].filter(Boolean);
}

// ------------------------------------------------------------------
// Precondiciones: se comprueban justo antes de enviar (un recordatorio de
// una reserva ya pagada no debe salir aunque estuviera en cola).
// ------------------------------------------------------------------

export function notificationPrecondition(ctx: NotificationContext, now: Date): { ok: true } | { ok: false; reason: string } {
  const n = ctx.notification;
  const r = ctx.reservation;
  const needReservation = (): { ok: false; reason: string } | null => (r ? null : { ok: false, reason: 'reserva no encontrada' });

  switch (n.template) {
    case 'launch_announcement':
    case 'balance_request':
    case 'balance_reminder':
    case 'expiry_warning':
      return needReservation() ??
        (r!.status === 'balance_due' && r!.balance_due_at && new Date(r!.balance_due_at) > now
          ? { ok: true }
          : { ok: false, reason: `la reserva ya no está pendiente de pago (${r!.status})` });
    case 'reservation_confirmed':
    case 'deposit_receipt':
      return needReservation() ?? (r!.deposit_status !== 'unpaid' ? { ok: true } : { ok: false, reason: 'señal sin pagar' });
    case 'reservation_expired':
      return needReservation() ?? (r!.status === 'expired' ? { ok: true } : { ok: false, reason: `la reserva no está caducada (${r!.status})` });
    case 'reservation_cancelled':
      return needReservation() ?? (r!.status === 'cancelled' ? { ok: true } : { ok: false, reason: `la reserva no está cancelada (${r!.status})` });
    case 'balance_paid':
      return needReservation() ?? (r!.status === 'completed' ? { ok: true } : { ok: false, reason: 'reserva no completada' });
    case 'direct_purchase':
    case 'shop_direct_sale':
    case 'order_status_update':
      return ctx.order ? { ok: true } : { ok: false, reason: 'pedido no encontrado' };
    case 'shop_new_reservation':
    case 'shop_balance_paid':
      return needReservation() ?? { ok: true };
    case 'refund_issued':
    case 'shop_review_needed':
      return { ok: true };
    default:
      return { ok: false, reason: `plantilla desconocida: ${n.template}` };
  }
}

// ------------------------------------------------------------------
// Render
// ------------------------------------------------------------------

export function renderNotification(ctx: NotificationContext, links: EmailLinks, now = new Date()): RenderedEmail {
  const n = ctx.notification;
  const r = ctx.reservation;
  const o = ctx.order;
  const resLink = links.reservation ?? links.site;
  const orderLink = links.order ?? links.site;

  switch (n.template) {
    case 'reservation_confirmed': {
      const res = r!;
      const window = res.terms_snapshot?.balance_window_days ?? 30;
      return {
        subject: `Reserva confirmada · ${res.code}`,
        html: presaleShell(
          'Tu juego está reservado',
          p(`Gracias${res.customer_name ? `, ${esc(res.customer_name)}` : ''}. Tu plaza en la tirada queda asegurada: las unidades se fabrican en una producción limitada y la tuya ya está descontada del stock.`) +
            batchLine(ctx) +
            heading('Tu configuración') +
            configRows(res) +
            heading('Importes') +
            priceRows(res) +
            p(`Cuando se produzca el <strong>lanzamiento oficial</strong> te escribiremos para completar el pago. Tendrás <strong>${window} días naturales</strong> desde el lanzamiento para hacerlo, sin necesidad de crear una cuenta.`) +
            button(resLink, 'Ver mi reserva') +
            termsBlock(res)
        ),
        text: plainLines([
          'Tu juego está reservado.',
          ...reservationText(res),
          `Tras el lanzamiento oficial tendrás ${window} días para completar el pago.`,
          `Ver tu reserva: ${resLink}`,
        ]),
      };
    }

    case 'deposit_receipt': {
      const res = r!;
      const review = res.status === 'needs_review';
      return {
        subject: `Pago de reserva recibido · ${formatPrice(res.deposit_cents)}`,
        html: presaleShell(
          'Hemos recibido tu pago de reserva',
          rows([
            ['Reserva', res.code],
            ['Importe pagado', formatPrice(res.deposit_cents), true],
            ['Fecha', madridDateTime(res.deposit_paid_at)],
            ['Referencia de pago', res.stripe_deposit_payment_intent_id ?? '—'],
          ]) +
            (review
              ? p('Estamos revisando la disponibilidad de tu configuración. Te escribiremos en breve; si no fuera posible mantener la reserva, te devolveremos el importe íntegro.')
              : p('Este importe se descuenta del precio final de tu juego.')) +
            button(resLink, 'Ver mi reserva')
        ),
        text: plainLines([
          `Pago de reserva recibido: ${formatPrice(res.deposit_cents)}`,
          `Reserva ${res.code} · ${madridDateTime(res.deposit_paid_at)}`,
          review ? 'Estamos revisando la disponibilidad; te escribiremos en breve.' : 'Se descuenta del precio final.',
          `Ver tu reserva: ${resLink}`,
        ]),
      };
    }

    case 'launch_announcement':
    case 'balance_request': {
      const res = r!;
      const isLaunch = n.template === 'launch_announcement';
      return {
        subject: isLaunch
          ? `Lanzamiento oficial · completa el pago de tu reserva ${res.code}`
          : `Completa el pago de tu reserva ${res.code}`,
        html: presaleShell(
          isLaunch ? 'Ha llegado el lanzamiento oficial' : 'Completa el pago de tu reserva',
          p(
            isLaunch
              ? `La tirada <strong>${esc(ctx.batch?.name ?? '')}</strong> ya es oficial. Como tienes reserva, tus llantas están apartadas a tu nombre hasta la fecha límite: solo falta completar el pago.`
              : 'Tus llantas siguen apartadas a tu nombre hasta la fecha límite. Puedes completar el pago ahora, sin iniciar sesión.'
          ) +
            deadlineBlock(res, now) +
            heading('Tu configuración') +
            configRows(res) +
            heading('Importes') +
            priceRows(res) +
            button(resLink, `Pagar ${formatPrice(res.balance_cents)}`) +
            small('El pago se realiza de forma segura con Stripe. Nunca cobramos importes automáticamente: solo se cobra cuando tú completas el pago.')
        ),
        text: plainLines([
          isLaunch ? 'Lanzamiento oficial.' : 'Completa el pago de tu reserva.',
          `Fecha límite: ${madridDateTime(res.balance_due_at)}`,
          ...reservationText(res),
          `Pagar ahora: ${resLink}`,
        ]),
      };
    }

    case 'balance_reminder':
    case 'expiry_warning': {
      const res = r!;
      const days = daysLeft(res.balance_due_at, now);
      const warning = n.template === 'expiry_warning';
      return {
        subject: warning
          ? `Tu reserva ${res.code} caduca en ${days} ${days === 1 ? 'día' : 'días'}`
          : `Recordatorio: completa el pago de tu reserva ${res.code}`,
        html: presaleShell(
          warning ? 'Tu reserva caduca pronto' : 'Recordatorio de pago',
          p(
            warning
              ? 'Si el pago no se completa antes de la fecha límite, la reserva caducará y las unidades volverán a ponerse a la venta.'
              : 'Te recordamos que tus llantas siguen reservadas a tu nombre y que el plazo para completar el pago sigue abierto.'
          ) +
            deadlineBlock(res, now) +
            priceRows(res) +
            button(resLink, `Pagar ${formatPrice(res.balance_cents)}`) +
            termsBlock(res)
        ),
        text: plainLines([
          warning ? 'Tu reserva caduca pronto.' : 'Recordatorio de pago.',
          `Fecha límite: ${madridDateTime(res.balance_due_at)}`,
          `Importe pendiente: ${formatPrice(res.balance_cents)}`,
          `Pagar ahora: ${resLink}`,
        ]),
      };
    }

    case 'reservation_expired': {
      const res = r!;
      const deposit = label(DEPOSIT_STATUS_LABEL, res.deposit_status);
      return {
        subject: `Tu reserva ${res.code} ha caducado`,
        html: presaleShell(
          'Tu reserva ha caducado',
          p(`El plazo para completar el pago terminó el ${esc(madridDateTime(res.balance_due_at))} y la reserva ha caducado. Las unidades han vuelto a ponerse a la venta.`) +
            rows([
              ['Reserva', res.code],
              ['Reserva abonada', formatPrice(res.deposit_cents)],
              ['Estado de la reserva abonada', deposit],
            ]) +
            p('El tratamiento del importe de la reserva se rige por las condiciones que aceptaste al reservar (incluidas abajo). Si tienes cualquier duda, responde a este correo.') +
            termsBlock(res)
        ),
        text: plainLines([
          `Tu reserva ${res.code} ha caducado (${madridDateTime(res.balance_due_at)}).`,
          `Reserva abonada: ${formatPrice(res.deposit_cents)} · ${deposit}`,
          'El importe se trata según las condiciones aceptadas al reservar.',
        ]),
      };
    }

    case 'balance_paid': {
      const res = r!;
      return {
        subject: `Pago completado · pedido ${o?.code ?? res.code}`,
        html: presaleShell(
          'Pago completado',
          p('Hemos recibido el pago final. Tu reserva se ha convertido en pedido y entra en el plan de fabricación y envío.') +
            rows([
              ['Pedido', o?.code ?? '—'],
              ['Reserva', res.code],
            ]) +
            heading('Tu configuración') +
            configRows(res) +
            heading('Importes') +
            priceRows(res, { paidInFull: true }) +
            addressBlock(o?.shipping_address ?? null) +
            batchLine(ctx) +
            button(orderLink, 'Seguir mi pedido')
        ),
        text: plainLines([
          'Pago completado.',
          `Pedido ${o?.code ?? '—'} · Reserva ${res.code}`,
          `Total pagado: ${formatPrice(res.total_cents)}`,
          `Seguir tu pedido: ${orderLink}`,
        ]),
      };
    }

    case 'direct_purchase': {
      const order = o!;
      return {
        subject: `Pedido confirmado · ${order.code ?? ''}`.trim(),
        html: presaleShell(
          '¡Gracias por tu pedido!',
          p('Hemos recibido tu pago correctamente. Este es el resumen de tu compra:') +
            rows([
              ['Pedido', order.code ?? '—'],
              ['Fecha', madridDateTime(order.created_at)],
            ]) +
            orderItemsRows(ctx) +
            rows([['Total (IVA incluido)', formatPrice(order.amount_total_cents), true]]) +
            addressBlock(order.shipping_address) +
            batchLine(ctx) +
            button(orderLink, 'Seguir mi pedido')
        ),
        text: plainLines([
          `Pedido confirmado ${order.code ?? ''}`,
          `Total: ${formatPrice(order.amount_total_cents)} (IVA incluido)`,
          `Seguir tu pedido: ${orderLink}`,
        ]),
      };
    }

    case 'reservation_cancelled': {
      const res = r!;
      const deposit = label(DEPOSIT_STATUS_LABEL, res.deposit_status);
      const byBatch = (n.payload as { by?: string })?.by === 'batch_cancelled';
      return {
        subject: `Reserva ${res.code} cancelada`,
        html: presaleShell(
          'Tu reserva se ha cancelado',
          p(
            byBatch
              ? 'Lamentamos comunicarte que la tirada de fabricación de tu reserva se ha cancelado.'
              : 'Te confirmamos la cancelación de tu reserva.'
          ) +
            rows([
              ['Reserva', res.code],
              ['Reserva abonada', formatPrice(res.deposit_cents)],
              ['Estado de la reserva abonada', deposit],
            ]) +
            (res.deposit_status === 'refund_pending'
              ? p('Vamos a devolverte el importe por el mismo medio de pago. Te avisaremos cuando la devolución esté procesada.')
              : '') +
            small('Si tienes cualquier duda, responde a este correo.')
        ),
        text: plainLines([`Reserva ${res.code} cancelada.`, `Reserva abonada: ${formatPrice(res.deposit_cents)} · ${deposit}`]),
      };
    }

    case 'refund_issued': {
      const payload = n.payload as { amount_cents?: number; purpose?: string };
      const amount = formatPrice(payload.amount_cents ?? 0);
      const ref = r?.code ?? o?.code ?? '';
      return {
        subject: `Devolución procesada · ${amount}`,
        html: presaleShell(
          'Devolución procesada',
          p(`Hemos procesado una devolución de <strong>${esc(amount)}</strong>${ref ? ` (${esc(ref)})` : ''} al mismo medio de pago que usaste.`) +
            small('Según tu banco, el importe puede tardar entre 5 y 10 días hábiles en aparecer en tu cuenta.')
        ),
        text: plainLines([`Devolución procesada: ${amount}${ref ? ` (${ref})` : ''}.`]),
      };
    }

    case 'order_status_update': {
      const order = o!;
      const status = label(ORDER_STATUS_LABEL, (n.payload as { status?: string })?.status ?? order.status);
      return {
        subject: `Tu pedido ${order.code ?? ''}: ${status}`.replace('  ', ' '),
        html: presaleShell(
          `Pedido ${status.toLowerCase()}`,
          rows([
            ['Pedido', order.code ?? '—'],
            ['Estado', status, true],
            ...(order.carrier ? ([['Transportista', order.carrier]] as [string, string][]) : []),
            ...(order.tracking_number ? ([['Seguimiento', order.tracking_number]] as [string, string][]) : []),
          ]) + button(orderLink, 'Ver mi pedido')
        ),
        text: plainLines([`Pedido ${order.code ?? ''}: ${status}`, order.tracking_number ? `Seguimiento: ${order.tracking_number}` : '', orderLink]),
      };
    }

    // ---------------- Avisos internos a la tienda ----------------

    case 'shop_new_reservation': {
      const res = r!;
      return {
        subject: `Nueva reserva ${res.code} · ${res.finish_name} ${sizeOf(res)} ${formatEt(res.et)} · ${res.quantity_sets} juego(s)`,
        replyTo: res.email ?? undefined,
        html: presaleShell(
          'Nueva reserva',
          configRows(res) +
            priceRows(res) +
            rows([
              ['Cliente', [res.customer_name, res.email].filter(Boolean).join(' · ') || '—'],
              ['Vehículo', [res.vehicle_make, res.vehicle_model, res.vehicle_year].filter(Boolean).join(' ') || 'No indicado'],
              ['Tirada', ctx.batch?.name ?? '—'],
            ]) +
            button(`${links.site}/admin/reservas/${res.id}`, 'Abrir en el panel')
        ),
        text: plainLines([`Nueva reserva ${res.code}`, ...reservationText(res), `Cliente: ${res.email ?? '—'}`]),
      };
    }

    case 'shop_balance_paid': {
      const res = r!;
      return {
        subject: `Reserva ${res.code} pagada por completo · pedido ${o?.code ?? ''}`,
        replyTo: res.email ?? undefined,
        html: presaleShell(
          'Reserva pagada por completo',
          configRows(res) +
            priceRows(res, { paidInFull: true }) +
            addressBlock(o?.shipping_address ?? null) +
            button(`${links.site}/admin/pedidos/${o?.id ?? ''}`, 'Abrir el pedido')
        ),
        text: plainLines([`Reserva ${res.code} pagada · pedido ${o?.code ?? ''}`, ...reservationText(res)]),
      };
    }

    case 'shop_direct_sale': {
      const order = o!;
      const sets = ctx.order_items.reduce((s, i) => s + (i.sets ?? 0), 0);
      return {
        subject: `Venta directa ${order.code ?? ''} · ${sets} juego(s) · ${formatPrice(order.amount_total_cents)}`,
        replyTo: order.customer_email ?? undefined,
        html: presaleShell(
          'Nueva venta directa',
          orderItemsRows(ctx) +
            rows([
              ['Total', formatPrice(order.amount_total_cents), true],
              ['Cliente', [order.customer_name, order.customer_email, order.customer_phone].filter(Boolean).join(' · ') || '—'],
            ]) +
            addressBlock(order.shipping_address) +
            button(`${links.site}/admin/pedidos/${order.id}`, 'Abrir el pedido')
        ),
        text: plainLines([`Venta directa ${order.code ?? ''}`, `Total: ${formatPrice(order.amount_total_cents)}`]),
      };
    }

    case 'shop_review_needed': {
      const payload = n.payload as { reason?: string; session?: string; amount_cents?: number };
      const reasonText: Record<string, string> = {
        paid_without_stock: 'Pago recibido sin plaza disponible (webhook tardío y tirada completa). Decidir: ampliar capacidad o devolver.',
        paid_after_expiry_without_stock: 'Pago final recibido tras caducar la reserva y sin plaza libre. Decidir: ampliar capacidad o devolver.',
        duplicate_balance_payment: 'Pago final duplicado (dos sesiones pagadas). Devolver el segundo cobro.',
        amount_mismatch: 'El importe cobrado no coincide con el esperado. Revisar en Stripe.',
        allocation_not_reserved: 'La plaza de la reserva no estaba reservada al recibir el pago.',
      };
      const target = r ? `${links.site}/admin/reservas/${r.id}` : o ? `${links.site}/admin/pedidos/${o.id}` : `${links.site}/admin`;
      return {
        subject: `⚠ Revisión necesaria · ${r?.code ?? o?.code ?? ''} · ${payload.reason ?? ''}`,
        html: presaleShell(
          'Revisión manual necesaria',
          p(esc(reasonText[payload.reason ?? ''] ?? payload.reason ?? 'Incidencia de pago')) +
            rows([
              ['Referencia', r?.code ?? o?.code ?? '—'],
              ['Sesión de Stripe', payload.session ?? '—'],
              ...(payload.amount_cents != null ? ([['Importe', formatPrice(payload.amount_cents)]] as [string, string][]) : []),
            ]) +
            button(target, 'Revisar en el panel')
        ),
        text: plainLines([`Revisión necesaria: ${payload.reason ?? ''}`, `Sesión: ${payload.session ?? '—'}`, target]),
      };
    }

    default:
      throw new Error(`Plantilla de correo desconocida: ${n.template}`);
  }
}
