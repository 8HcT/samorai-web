/**
 * Despachador de correos contra PostgreSQL real con un emisor simulado (en
 * lugar de la API de Resend): plantillas, enlaces seguros, retención de
 * envíos masivos, precondiciones, reintentos ante fallos y duplicados.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { T0, createBatch, daysAfter, launch, payBalance, reserveAndPay } from '../helpers/fixtures';
import { dispatchNotifications, retryDelayMs, type DispatchDeps, type OutgoingEmail } from '~/lib/email/outbox.server';
import { verifyAccessToken } from '~/lib/presale/access.server';
import { formatPrice } from '~/lib/money';

let db: TestDb;
const sent: OutgoingEmail[] = [];
let failNext = 0;
let bulk = false;

function deps(overrides: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    rpc: db.rpc,
    send: async (email) => {
      if (failNext > 0) {
        failNext--;
        throw new Error('resend_503: Service Unavailable');
      }
      sent.push(email);
      return { id: `re_${sent.length}` };
    },
    now: () => new Date(),
    bulkEnabled: () => bulk,
    shopRecipients: () => ['shop@example.com'],
    from: () => 'SAMORAI <test@example.com>',
    site: () => 'https://shop.example.com',
    pauseMs: 0,
    ...overrides,
  };
}

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db?.close();
});

describe('despachador de correos', () => {
  it('envía la confirmación y el recibo de la reserva con enlace seguro y datos correctos', async () => {
    const batchId = await createBatch(db.rpc, {}, { now: T0 });
    const { hold } = await reserveAndPay(db.rpc, batchId, { email: 'cliente@example.com', now: new Date() });
    const summary = await dispatchNotifications({}, deps());
    expect(summary.sent).toBeGreaterThanOrEqual(3);

    const confirmation = sent.find((m) => m.subject.startsWith('Reserva confirmada'))!;
    expect(confirmation.to).toEqual(['cliente@example.com']);
    expect(confirmation.html).toContain(formatPrice(114000)); // precio final
    expect(confirmation.html).toContain(formatPrice(109000)); // pendiente
    expect(confirmation.html).toContain('Texto de prueba de cancelación'); // condiciones aceptadas
    const link = /https:\/\/shop\.example\.com\/reserva\/([0-9a-f-]+)\?t=([A-Za-z0-9_-]+)/.exec(confirmation.html)!;
    expect(link[1]).toBe(hold.reservation_id);
    expect(verifyAccessToken('reservation', link[1], 1, link[2])).toBe(true);

    const shop = sent.find((m) => m.subject.startsWith('Nueva reserva'))!;
    expect(shop.to).toEqual(['shop@example.com']);
    expect(shop.replyTo).toBe('cliente@example.com');

    const rows = await db.query(`select status, provider_message_id from email_notifications where reservation_id = $1`, [hold.reservation_id]);
    expect(rows.every((r) => r.status === 'sent' && r.provider_message_id)).toBe(true);

    // Una segunda pasada no reenvía nada.
    const before = sent.length;
    await dispatchNotifications({}, deps());
    expect(sent.length).toBe(before);
  });

  it('retiene los envíos masivos hasta la validación expresa y luego los envía', async () => {
    const batchId = await createBatch(db.rpc, {}, { now: T0 });
    const { hold } = await reserveAndPay(db.rpc, batchId, { email: 'masivo@example.com', now: new Date() });
    await dispatchNotifications({}, deps());
    await launch(db.rpc, batchId, new Date());

    bulk = false;
    await dispatchNotifications({}, deps());
    const [held] = await db.query(`select status, attempts from email_notifications where reservation_id = $1 and template = 'launch_announcement'`, [hold.reservation_id]);
    expect(held).toEqual({ status: 'held', attempts: 0 });

    bulk = true;
    await db.rpc('notification_release_held', {});
    await dispatchNotifications({}, deps());
    const launchMail = sent.find((m) => m.subject.startsWith('Lanzamiento oficial') && m.to[0] === 'masivo@example.com')!;
    expect(launchMail.html).toContain('Fecha límite de pago');
    expect(launchMail.html).toContain(`Pagar ${formatPrice(109000)}`);
    bulk = false;
  });

  it('cancela un recordatorio si la reserva ya está pagada al ir a enviarlo', async () => {
    const batchId = await createBatch(db.rpc, {}, { now: T0 });
    const { hold } = await reserveAndPay(db.rpc, batchId, { email: 'pagado@example.com', now: new Date() });
    await dispatchNotifications({}, deps());
    await launch(db.rpc, batchId, new Date());
    await db.rpc('presale_enqueue', {
      p_template: 'balance_reminder', p_dedupe_key: `balance_reminder:${hold.reservation_id}`, p_audience: 'customer',
      p_to_email: 'pagado@example.com', p_reservation_id: hold.reservation_id, p_is_bulk: true,
    });
    await payBalance(db.rpc, hold.reservation_id, { now: new Date() });
    bulk = true;
    await dispatchNotifications({}, deps());
    bulk = false;
    const [row] = await db.query(`select status, last_error from email_notifications where dedupe_key = $1`, [`balance_reminder:${hold.reservation_id}`]);
    expect(row.status).toBe('cancelled');
    expect(row.last_error).toMatch(/ya no está pendiente/);
    expect(sent.find((m) => m.subject.startsWith('Pago completado'))).toBeTruthy();
  });

  it('fallo temporal de Resend → reintento con espera creciente, sin duplicar', async () => {
    const id = await db.rpc<string>('presale_enqueue', {
      p_template: 'refund_issued', p_dedupe_key: `refund-test-${Date.now()}`, p_audience: 'customer', p_to_email: 'retry@example.com',
      p_payload: { amount_cents: 5000 },
    });
    failNext = 1;
    const first = await dispatchNotifications({ ids: [id] }, deps());
    expect(first).toMatchObject({ claimed: 1, failed: 1 });
    const [afterFail] = await db.query('select status, attempts, last_error, next_attempt_at from email_notifications where id = $1', [id]);
    expect(afterFail).toMatchObject({ status: 'failed', attempts: 1, last_error: 'resend_503: Service Unavailable' });
    expect(new Date(afterFail.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + retryDelayMs(1) - 5_000);

    // Antes de tiempo no se reintenta…
    expect((await dispatchNotifications({ ids: [id] }, deps())).claimed).toBe(0);
    // …pasado el plazo, sí, y se envía una sola vez.
    const later = deps({ now: () => new Date(Date.now() + retryDelayMs(1) + 1000) });
    await db.query(`update email_notifications set next_attempt_at = now() where id = $1`, [id]);
    const second = await dispatchNotifications({ ids: [id] }, later);
    expect(second.sent).toBe(1);
    expect(sent.filter((m) => m.to[0] === 'retry@example.com')).toHaveLength(1);
    expect(sent.find((m) => m.to[0] === 'retry@example.com')!.idempotencyKey).toBe(`samorai-notification-${id}`);
  });

  it('sin Resend configurado no se gastan intentos: los correos esperan en la cola', async () => {
    const id = await db.rpc<string>('presale_enqueue', {
      p_template: 'refund_issued', p_dedupe_key: `noconf-${Date.now()}`, p_audience: 'customer', p_to_email: 'wait@example.com',
    });
    const res = await dispatchNotifications({ ids: [id] }, deps({ from: () => null }));
    expect(res.skipped).toBe('not_configured');
    const [row] = await db.query('select status, attempts from email_notifications where id = $1', [id]);
    expect(row).toEqual({ status: 'pending', attempts: 0 });
  });

  it('escapa los datos del cliente en el HTML', async () => {
    const batchId = await createBatch(db.rpc, {}, { now: T0 });
    const { hold } = await reserveAndPay(db.rpc, batchId, { email: 'xss@example.com', now: new Date() });
    await db.query(`update reservations set customer_name = '<script>alert(1)</script>' where id = $1`, [hold.reservation_id]);
    await dispatchNotifications({}, deps());
    const mail = sent.find((m) => m.to[0] === 'xss@example.com' && m.subject.startsWith('Reserva confirmada'))!;
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('el pedido de venta directa y el aviso de caducidad usan sus plantillas', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 2 }, { now: T0 });
    const { hold } = await reserveAndPay(db.rpc, batchId, { email: 'caduca@example.com', now: new Date() });
    await dispatchNotifications({}, deps());
    await launch(db.rpc, batchId, daysAfter(new Date(), -31));
    await db.rpc('presale_run_maintenance', {});
    bulk = true;
    await dispatchNotifications({}, deps());
    bulk = false;
    const expired = sent.find((m) => m.to[0] === 'caduca@example.com' && /ha caducado/.test(m.subject));
    expect(expired?.html).toContain('Estado de la reserva abonada');
    const [r] = await db.query('select status, deposit_status from reservations where id = $1', [hold.reservation_id]);
    expect(r).toEqual({ status: 'expired', deposit_status: 'paid' });
  });
});
