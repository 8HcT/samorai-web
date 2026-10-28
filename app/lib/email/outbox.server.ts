/**
 * Despachador de la cola de correos (email_notifications) con Resend.
 *
 * · Reclama correos con SKIP LOCKED (dos ejecuciones a la vez no duplican).
 * · Antes de enviar vuelve a comprobar el estado (un recordatorio de una
 *   reserva ya pagada se cancela en lugar de enviarse).
 * · Envíos masivos/automáticos: retenidos hasta PRESALE_BULK_EMAILS_ENABLED.
 * · Fallos temporales de Resend: reintento con espera creciente; cada intento
 *   queda registrado (attempts, last_error y audit_events).
 * · Idempotency-Key por correo: un reintento tras un timeout no duplica.
 */
import { env, siteUrl } from '~/lib/env.server';
import { orderLink, reservationLink } from '~/lib/presale/access.server';
import { isAccessLinkSecretConfigured, presaleBulkEmailsEnabled } from '~/lib/presale/config.server';
import { adminRpc, isPresaleDbConfigured, type Rpc } from '~/lib/presale/rpc.server';
import type { NotificationContext, NotificationRow } from '~/lib/presale/rows';
import { getResend, recipients } from './email.server';
import { notificationPrecondition, renderNotification } from './presale-templates.server';

export interface OutgoingEmail {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  idempotencyKey: string;
}

export interface DispatchDeps {
  rpc: Rpc;
  send: (email: OutgoingEmail) => Promise<{ id: string | null }>;
  now: () => Date;
  bulkEnabled: () => boolean;
  shopRecipients: () => string[];
  from: () => string | null;
  site: () => string;
  /** Pausa entre envíos (límite de Resend: 2 peticiones/segundo). */
  pauseMs: number;
}

export interface DispatchSummary {
  claimed: number;
  sent: number;
  failed: number;
  cancelled: number;
  skipped?: 'not_configured';
}

/** Espera antes del siguiente intento según los intentos ya hechos. */
export function retryDelayMs(attempts: number): number {
  const schedule = [2, 10, 30, 120, 360, 720]; // minutos
  return schedule[Math.min(Math.max(attempts, 1), schedule.length) - 1] * 60_000;
}

async function resendSend(email: OutgoingEmail): Promise<{ id: string | null }> {
  const resend = getResend();
  if (!resend) throw new Error('Resend no configurado');
  const { data, error } = await resend.emails.send(
    {
      from: email.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    },
    { idempotencyKey: email.idempotencyKey }
  );
  if (error) throw new Error(`${error.name ?? 'resend_error'}: ${error.message}`);
  return { id: data?.id ?? null };
}

export function defaultDispatchDeps(): DispatchDeps {
  return {
    rpc: adminRpc,
    send: resendSend,
    now: () => new Date(),
    bulkEnabled: presaleBulkEmailsEnabled,
    shopRecipients: () => recipients('SHOP_ORDER_EMAIL'),
    from: () => (getResend() ? env('EMAIL_FROM') ?? null : null),
    site: siteUrl,
    pauseMs: 550,
  };
}

function linksFor(ctx: NotificationContext, site: string) {
  const canSign = isAccessLinkSecretConfigured();
  return {
    site,
    reservation: ctx.reservation && canSign ? reservationLink(ctx.reservation.id, ctx.reservation.access_version, site) : null,
    order: ctx.order && canSign ? orderLink(ctx.order.id, ctx.order.access_version, site) : null,
  };
}

async function complete(
  deps: DispatchDeps,
  id: string,
  status: 'sent' | 'failed' | 'cancelled' | 'held',
  extra: { error?: string; providerId?: string | null; retryAt?: Date } = {}
) {
  await deps.rpc('notification_complete', {
    p_id: id,
    p_status: status,
    p_error: extra.error ?? null,
    p_provider_id: extra.providerId ?? null,
    p_retry_at: extra.retryAt ? extra.retryAt.toISOString() : null,
  });
}

export async function dispatchNotifications(
  opts: { ids?: string[]; limit?: number } = {},
  deps: DispatchDeps = defaultDispatchDeps()
): Promise<DispatchSummary> {
  const summary: DispatchSummary = { claimed: 0, sent: 0, failed: 0, cancelled: 0 };
  if (deps.rpc === adminRpc && !isPresaleDbConfigured()) return { ...summary, skipped: 'not_configured' };

  const from = deps.from();
  // Sin Resend configurado no se reclama nada: los correos esperan en la cola
  // y salen en cuanto se configure (no se gastan intentos).
  if (!from) return { ...summary, skipped: 'not_configured' };

  const claimed = await deps.rpc<NotificationRow[]>('notification_claim', {
    p_ids: opts.ids && opts.ids.length > 0 ? opts.ids : null,
    p_limit: opts.limit ?? 25,
    p_include_bulk: deps.bulkEnabled(),
  });
  summary.claimed = claimed.length;

  for (const [index, n] of claimed.entries()) {
    try {
      const ctx = await deps.rpc<NotificationContext>('notification_context', { p_id: n.id });
      const pre = notificationPrecondition(ctx, deps.now());
      if (!pre.ok) {
        await complete(deps, n.id, 'cancelled', { error: pre.reason });
        summary.cancelled++;
        continue;
      }

      const to = n.audience === 'shop' ? deps.shopRecipients() : n.to_email ? [n.to_email] : [];
      if (to.length === 0) {
        await complete(deps, n.id, 'cancelled', {
          error: n.audience === 'shop' ? 'SHOP_ORDER_EMAIL sin configurar' : 'sin destinatario',
        });
        summary.cancelled++;
        continue;
      }

      const rendered = renderNotification(ctx, linksFor(ctx, deps.site()), deps.now());
      if (index > 0 && deps.pauseMs > 0) await new Promise((r) => setTimeout(r, deps.pauseMs));
      const { id: providerId } = await deps.send({
        from,
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        replyTo: rendered.replyTo,
        idempotencyKey: `samorai-notification-${n.id}`,
      });
      await complete(deps, n.id, 'sent', { providerId });
      summary.sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryAt = new Date(deps.now().getTime() + retryDelayMs(n.attempts));
      console.error('[email][outbox] fallo enviando', n.template, n.id, message);
      try {
        await complete(deps, n.id, 'failed', { error: message, retryAt });
      } catch (markErr) {
        // Si ni siquiera se puede marcar, el mantenimiento lo recupera
        // (los correos "enviando" > 15 min vuelven a la cola).
        console.error('[email][outbox] no se pudo registrar el fallo', n.id, markErr);
      }
      summary.failed++;
    }
  }

  return summary;
}
