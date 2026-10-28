/**
 * Seguridad y operación contra PostgreSQL real: RLS (cada usuario solo ve lo
 * suyo, anon nada), roles, vinculación de compras de invitado, idempotencia
 * de eventos de Stripe, cola de correos y estadísticas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asRole, createTestDb, type TestDb } from '../helpers/db';
import {
  T0,
  VARIANT_275,
  VARIANT_300,
  createBatch,
  daysAfter,
  launch,
  minutesAfter,
  payBalance,
  reserveAndPay,
} from '../helpers/fixtures';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db?.close();
});

async function createUser(email: string): Promise<string> {
  const [u] = await db.query('insert into auth.users (email) values ($1) returning id', [email]);
  return u.id;
}

describe('RLS y permisos', () => {
  it('anon no puede leer tablas ni ejecutar funciones', async () => {
    const batchId = await createBatch(db.rpc);
    await reserveAndPay(db.rpc, batchId);
    for (const table of ['reservations', 'orders', 'payments', 'production_batches', 'inventory_allocations', 'email_notifications', 'profiles']) {
      await expect(asRole(db.pool, 'anon', null, (c) => c.query(`select * from ${table}`))).rejects.toThrow(/permission denied/);
    }
    await expect(
      asRole(db.pool, 'anon', null, (c) => c.query(`select presale_run_maintenance()`))
    ).rejects.toThrow(/permission denied/);
  });

  it('un cliente autenticado solo ve sus reservas, pedidos y pagos', async () => {
    const batchId = await createBatch(db.rpc);
    const alice = await createUser('alice@example.com');
    const bob = await createUser('bob@example.com');
    const a = await reserveAndPay(db.rpc, batchId, { email: 'alice@example.com' });
    const b = await reserveAndPay(db.rpc, batchId, { email: 'bob@example.com' });
    await db.query('update reservations set user_id = $1 where id = $2', [alice, a.hold.reservation_id]);
    await db.query('update reservations set user_id = $1 where id = $2', [bob, b.hold.reservation_id]);

    const seen = await asRole(db.pool, 'authenticated', alice, async (c) => ({
      reservations: (await c.query('select id from reservations')).rows.map((r) => r.id),
      payments: (await c.query('select reservation_id from payments')).rows.map((r) => r.reservation_id),
    }));
    expect(seen.reservations).toEqual([a.hold.reservation_id]);
    expect(seen.payments).toEqual([a.hold.reservation_id]);

    // No puede escribir en tablas de negocio ni ejecutar la lógica interna.
    await expect(asRole(db.pool, 'authenticated', alice, (c) =>
      c.query(`update reservations set status = 'completed' where id = $1`, [a.hold.reservation_id])
    )).rejects.toThrow(/permission denied/);
    await expect(asRole(db.pool, 'authenticated', alice, (c) =>
      c.query(`select presale_launch_batch($1)`, [batchId])
    )).rejects.toThrow(/permission denied/);
  });

  it('el cliente edita su nombre/teléfono pero nunca su rol ni su email', async () => {
    const carol = await createUser('carol@example.com');
    await asRole(db.pool, 'authenticated', carol, (c) =>
      c.query(`update profiles set full_name = 'Carol', phone = '600111222' where id = $1`, [carol])
    );
    await expect(asRole(db.pool, 'authenticated', carol, (c) =>
      c.query(`update profiles set role = 'admin' where id = $1`, [carol])
    )).rejects.toThrow(/permission denied/);
    await expect(asRole(db.pool, 'authenticated', carol, (c) =>
      c.query(`update profiles set email_verified_at = now() where id = $1`, [carol])
    )).rejects.toThrow(/permission denied/);
    // Tampoco el de otro usuario (RLS): 0 filas afectadas.
    const dave = await createUser('dave@example.com');
    const count = await asRole(db.pool, 'authenticated', carol, async (c) =>
      (await c.query(`update profiles set full_name = 'X' where id = $1`, [dave])).rowCount
    );
    expect(count).toBe(0);
  });

  it('crea el perfil automáticamente y resetea la verificación si cambia el email', async () => {
    const id = await createUser('eve@example.com');
    const [p] = await db.query('select email, role, email_verified_at from profiles where id = $1', [id]);
    expect(p).toEqual({ email: 'eve@example.com', role: 'customer', email_verified_at: null });
    await db.rpc('presale_mark_email_verified', { p_user_id: id, p_email: 'eve@example.com' });
    await db.query(`update auth.users set email = 'eve2@example.com' where id = $1`, [id]);
    const [p2] = await db.query('select email, email_verified_at from profiles where id = $1', [id]);
    expect(p2).toEqual({ email: 'eve2@example.com', email_verified_at: null });
  });
});

describe('comprador invitado que crea cuenta', () => {
  it('vincula sus reservas y pedidos solo tras verificar el email', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold } = await reserveAndPay(db.rpc, batchId, { email: 'Guest@Example.com' });
    const userId = await createUser('guest@example.com');

    expect(await db.rpc<any>('presale_claim_guest_records', { p_user_id: userId, p_email: 'guest@example.com' }))
      .toMatchObject({ ok: false, reason: 'email_not_verified' });

    await db.rpc('presale_mark_email_verified', { p_user_id: userId, p_email: 'guest@example.com' });
    const claim = await db.rpc<any>('presale_claim_guest_records', { p_user_id: userId, p_email: 'guest@example.com' });
    expect(claim).toMatchObject({ ok: true, reservations: 1 });
    const [r] = await db.query('select user_id from reservations where id = $1', [hold.reservation_id]);
    expect(r.user_id).toBe(userId);

    // No puede reclamar compras con un email que no es el suyo.
    expect(await db.rpc<any>('presale_claim_guest_records', { p_user_id: userId, p_email: 'otro@example.com' }))
      .toMatchObject({ ok: false });
  });
});

describe('eventos de Stripe', () => {
  it('procesa cada evento una sola vez y reintenta los fallidos', async () => {
    const created = new Date().toISOString();
    expect(await db.rpc<any>('stripe_event_begin', { p_event_id: 'evt_1', p_type: 'checkout.session.completed', p_livemode: false, p_created_at: created }))
      .toMatchObject({ process: true, retry: false });
    await db.rpc('stripe_event_finish', { p_event_id: 'evt_1', p_status: 'processed' });
    expect(await db.rpc<any>('stripe_event_begin', { p_event_id: 'evt_1', p_type: 'checkout.session.completed', p_livemode: false, p_created_at: created }))
      .toMatchObject({ process: false, status: 'processed' });

    await db.rpc('stripe_event_begin', { p_event_id: 'evt_2', p_type: 'x', p_livemode: false, p_created_at: created });
    await db.rpc('stripe_event_finish', { p_event_id: 'evt_2', p_status: 'failed', p_error: 'boom' });
    expect(await db.rpc<any>('stripe_event_begin', { p_event_id: 'evt_2', p_type: 'x', p_livemode: false, p_created_at: created }))
      .toMatchObject({ process: true, retry: true });
    const [e] = await db.query(`select attempts, status from stripe_events where id = 'evt_2'`);
    expect(e).toEqual({ attempts: 2, status: 'processing' });
  });
});

describe('cola de correos', () => {
  it('deduplica, reparte sin solaparse entre despachadores y registra los intentos', async () => {
    for (let i = 0; i < 6; i++) {
      await db.rpc('presale_enqueue', { p_template: 'deposit_receipt', p_dedupe_key: `k-${i}`, p_audience: 'customer', p_to_email: `n${i}@example.com` });
    }
    expect(await db.rpc('presale_enqueue', { p_template: 'deposit_receipt', p_dedupe_key: 'k-0', p_audience: 'customer', p_to_email: 'n0@example.com' }))
      .toBeNull();
    expect(await db.rpc('presale_enqueue', { p_template: 'deposit_receipt', p_dedupe_key: 'no-mail', p_audience: 'customer', p_to_email: '' }))
      .toBeNull();

    const [c1, c2] = await Promise.all([
      db.rpc<any[]>('notification_claim', { p_limit: 4 }),
      db.rpc<any[]>('notification_claim', { p_limit: 4 }),
    ]);
    const ids = [...c1, ...c2].map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect([...c1, ...c2].every((n) => n.status === 'sending' && n.attempts === 1)).toBe(true);

    const failed = c1[0].id;
    await db.rpc('notification_complete', { p_id: failed, p_status: 'failed', p_error: 'Resend 503', p_retry_at: minutesAfter(new Date(), 5) });
    const [row] = await db.query('select status, last_error from email_notifications where id = $1', [failed]);
    expect(row).toEqual({ status: 'failed', last_error: 'Resend 503' });
    // No se reintenta antes de tiempo…
    expect((await db.rpc<any[]>('notification_claim', { p_ids: [failed] }))).toHaveLength(0);
    // …pero sí después.
    expect((await db.rpc<any[]>('notification_claim', { p_ids: [failed], p_now: minutesAfter(new Date(), 6) }))).toHaveLength(1);
    const [audit] = await db.query(`select action from audit_events where entity_id = $1`, [failed]);
    expect(audit.action).toBe('send_failed');
  });

  it('los envíos masivos retenidos se liberan de forma explícita', async () => {
    const id = await db.rpc<string>('presale_enqueue', {
      p_template: 'launch_announcement', p_dedupe_key: 'bulk-1', p_audience: 'customer', p_to_email: 'b@example.com', p_is_bulk: true,
    });
    await db.query(`update email_notifications set status = 'held' where id = $1`, [id]);
    const res = await db.rpc<any>('notification_release_held', {});
    expect(res.released).toBeGreaterThanOrEqual(1);
    const [n] = await db.query('select status from email_notifications where id = $1', [id]);
    expect(n.status).toBe('pending');
  });

  it('el contexto de un correo trae reserva, tirada, pedido y pagos', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, daysAfter(T0, 20));
    await payBalance(db.rpc, hold.reservation_id, { now: daysAfter(T0, 21) });
    const [n] = await db.query(`select id from email_notifications where template = 'balance_paid' and reservation_id = $1`, [hold.reservation_id]);
    const ctx = await db.rpc<any>('notification_context', { p_id: n.id });
    expect(ctx.reservation.id).toBe(hold.reservation_id);
    expect(ctx.batch.id).toBe(batchId);
    expect(ctx.order.kind).toBe('presale');
    expect(ctx.order_items).toHaveLength(1);
    expect(ctx.payments.map((p: any) => p.purpose)).toEqual(['deposit', 'balance']);
  });
});

describe('estadísticas', () => {
  it('distingue lo cobrado de lo potencial y agrega la demanda', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 20 });
    const r1 = await reserveAndPay(db.rpc, batchId, { variantId: VARIANT_300, email: 's1@example.com' });
    await reserveAndPay(db.rpc, batchId, { variantId: VARIANT_300, sets: 2, email: 's2@example.com' });
    await reserveAndPay(db.rpc, batchId, { variantId: VARIANT_275, email: 's3@example.com' });
    await db.query(`update reservations set vehicle_make = 'BMW', vehicle_model = 'M3' where id = $1`, [r1.hold.reservation_id]);

    await launch(db.rpc, batchId, daysAfter(T0, 20));
    await payBalance(db.rpc, r1.hold.reservation_id, { now: daysAfter(T0, 21) });

    const s = await db.rpc<any>('presale_admin_stats', { p_batch_id: batchId });
    expect(s.reservations_total).toBe(3);
    expect(s.reservations_active).toBe(2);
    expect(s.reservations_completed).toBe(1);
    expect(s.deposits_collected_cents).toBe(4 * 5000);
    // Potencial = reservas activas (2 juegos a 300 € y 1 juego a 275 € con −5 %)
    expect(s.potential_revenue_cents).toBe(228000 + 104500);
    expect(s.potential_pending_cents).toBe(228000 - 10000 + 104500 - 5000);
    // Cobrado real = señales + pago restante de la reserva completada
    expect(s.collected_total_cents).toBe(4 * 5000 + 109000);
    expect(s.sales_completed_count).toBe(1);
    expect(s.sales_completed_cents).toBe(114000);
    expect(s.top_sizes[0]).toMatchObject({ width: 9, sets: 3 });
    expect(s.top_finishes[0]).toMatchObject({ label: 'Antracita Grey', sets: 4 });
    expect(s.top_vehicles[0]).toMatchObject({ make: 'BMW', model: 'M3', count: 1 });
    expect(s.top_configs[0]).toMatchObject({ variant_id: VARIANT_300, sets: 3 });

    const inv = await db.rpc<any>('presale_admin_batch_inventory', { p_batch_id: batchId, p_now: daysAfter(T0, 22) });
    expect(inv).toMatchObject({ capacity_sets: 20, reserved_sets: 3, sold_sets: 1, available_sets: 16 });
  });
});
