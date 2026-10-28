/**
 * Ciclo de vida completo contra PostgreSQL real: lanzamiento oficial, pago
 * restante, recordatorios día 15/25, caducidad día 30, venta directa,
 * cancelación de tirada, devoluciones y política de la señal.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import {
  ALL_VICTORIA_VARIANTS,
  HOLD_MINUTES,
  T0,
  VARIANT_300,
  createBatch,
  daysAfter,
  directLine,
  fakeSessionId,
  launch,
  minutesAfter,
  payBalance,
  reserve,
  reserveAndPay,
} from '../helpers/fixtures';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db?.close();
});

const LAUNCH = daysAfter(T0, 20);

async function reservation(id: string) {
  const [r] = await db.query('select * from reservations where id = $1', [id]);
  return r;
}

async function available(batchId: string, now: Date) {
  const offers = await db.rpc<any[]>('presale_public_offers', {
    p_product_slug: 'victoria', p_variants: ALL_VICTORIA_VARIANTS, p_now: now,
  });
  return offers.find((o) => o.id === batchId).available_sets as number;
}

async function templatesFor(reservationId: string) {
  return (await db.query('select template, is_bulk from email_notifications where reservation_id = $1 order by created_at, template', [reservationId]));
}

describe('lanzamiento oficial', () => {
  it('abre el plazo de pago de 30 días (UTC exacto) y encola el anuncio retenido como envío masivo', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold } = await reserveAndPay(db.rpc, batchId, { email: 'launch@example.com' });
    const res = await launch(db.rpc, batchId, LAUNCH);
    expect(res.reservations).toBe(1);

    const r = await reservation(hold.reservation_id);
    expect(r.status).toBe('balance_due');
    expect(new Date(r.balance_due_at).toISOString()).toBe(daysAfter(LAUNCH, 30).toISOString());

    const [batch] = await db.query('select status, launched_at from production_batches where id = $1', [batchId]);
    expect(batch.status).toBe('launched');
    expect(new Date(batch.launched_at).toISOString()).toBe(LAUNCH.toISOString());

    const notes = await templatesFor(hold.reservation_id);
    expect(notes).toContainEqual({ template: 'launch_announcement', is_bulk: true });
  });

  it('el plazo es configurable por tirada', async () => {
    const batchId = await createBatch(db.rpc, { balance_window_days: 20, first_reminder_day: 10, final_reminder_day: 17 });
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);
    expect(new Date((await reservation(hold.reservation_id)).balance_due_at).toISOString())
      .toBe(daysAfter(LAUNCH, 20).toISOString());
  });

  it('una señal confirmada después del lanzamiento entra directamente en plazo de pago', async () => {
    const batchId = await createBatch(db.rpc);
    const hold = await reserve(db.rpc, batchId, { now: LAUNCH });
    const session = fakeSessionId();
    await db.rpc('presale_attach_checkout', {
      p_allocation_id: hold.allocation_id, p_session_id: session, p_amount_cents: 5000,
      p_expires_at: minutesAfter(LAUNCH, 31), p_now: LAUNCH,
    });
    await launch(db.rpc, batchId, minutesAfter(LAUNCH, 5));
    const res = await db.rpc<any>('presale_confirm_deposit', {
      p_session_id: session, p_payment_intent_id: 'pi_after_launch', p_amount_cents: 5000,
      p_currency: 'eur', p_paid: true, p_now: minutesAfter(LAUNCH, 10),
    });
    expect(res.status).toBe('balance_due');
    expect((await templatesFor(hold.reservation_id)).map((n) => n.template)).toContain('balance_request');
  });

  it('las transiciones manuales siguen el orden de hitos', async () => {
    const batchId = await createBatch(db.rpc);
    expect(await db.rpc<any>('presale_set_batch_status', { p_batch_id: batchId, p_status: 'available' }))
      .toMatchObject({ ok: false, reason: 'invalid_transition' });
    await launch(db.rpc, batchId, LAUNCH);
    expect((await db.rpc<any>('presale_set_batch_status', { p_batch_id: batchId, p_status: 'in_production' })).ok).toBe(true);
    expect((await db.rpc<any>('presale_set_batch_status', { p_batch_id: batchId, p_status: 'available' })).ok).toBe(true);
    expect((await db.rpc<any>('presale_set_batch_status', { p_batch_id: batchId, p_status: 'completed' })).ok).toBe(true);
  });
});

describe('pago restante', () => {
  it('completa la reserva, vende la plaza, aplica la señal y crea el pedido', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold } = await reserveAndPay(db.rpc, batchId, { email: 'balance@example.com' });
    await launch(db.rpc, batchId, LAUNCH);

    const { begin, confirmed } = await payBalance(db.rpc, hold.reservation_id, { now: daysAfter(LAUNCH, 3) });
    expect(begin.balance_cents).toBe(109000);
    expect(confirmed.result).toBe('completed');

    const r = await reservation(hold.reservation_id);
    expect(r).toMatchObject({ status: 'completed', deposit_status: 'applied' });

    const [order] = await db.query('select * from orders where id = $1', [confirmed.order_id]);
    expect(order).toMatchObject({
      kind: 'presale',
      reservation_id: hold.reservation_id,
      amount_total_cents: 114000,
      subtotal_cents: 120000,
      discount_cents: 6000,
      amount_paid_cents: 114000,
      status: 'paid',
    });
    expect(order.code).toMatch(/^SO-/);
    const items = await db.query('select * from order_items where order_id = $1', [order.id]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ variant_id: VARIANT_300, quantity: 4, sets: 1, unit_price_cents: 30000 });

    const [a] = await db.query('select status, order_id from inventory_allocations where reservation_id = $1', [hold.reservation_id]);
    expect(a).toEqual({ status: 'sold', order_id: order.id });

    const payments = await db.query('select purpose, status, order_id from payments where reservation_id = $1 order by purpose', [hold.reservation_id]);
    expect(payments).toEqual([
      { purpose: 'balance', status: 'succeeded', order_id: order.id },
      { purpose: 'deposit', status: 'succeeded', order_id: order.id },
    ]);
    expect((await templatesFor(hold.reservation_id)).map((n) => n.template)).toEqual(
      expect.arrayContaining(['balance_paid', 'shop_balance_paid'])
    );
  });

  it('webhook duplicado del pago restante: un solo pedido', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);
    const { session } = await payBalance(db.rpc, hold.reservation_id, { now: daysAfter(LAUNCH, 1) });
    const again = await db.rpc<any>('presale_confirm_balance', {
      p_session_id: session, p_payment_intent_id: `pi_${session}`, p_amount_cents: 109000,
      p_currency: 'eur', p_paid: true, p_now: daysAfter(LAUNCH, 2),
    });
    expect(again.result).toBe('already');
    const [{ n }] = await db.query('select count(*)::int as n from orders where reservation_id = $1', [hold.reservation_id]);
    expect(n).toBe(1);
  });

  it('dos sesiones pagadas (dos pestañas): el segundo cobro queda para devolver', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);
    const now = daysAfter(LAUNCH, 1);
    const s1 = fakeSessionId();
    const s2 = fakeSessionId();
    for (const s of [s1, s2]) {
      await db.rpc('presale_attach_balance_checkout', {
        p_reservation_id: hold.reservation_id, p_session_id: s, p_amount_cents: 109000,
        p_expires_at: minutesAfter(now, 60), p_now: now,
      });
    }
    const pay = (s: string) => db.rpc<any>('presale_confirm_balance', {
      p_session_id: s, p_payment_intent_id: `pi_${s}`, p_amount_cents: 109000, p_currency: 'eur',
      p_paid: true, p_now: minutesAfter(now, 2),
    });
    const results = await Promise.all([pay(s1), pay(s2)]);
    expect(results.map((r) => r.result).sort()).toEqual(['completed', 'duplicate_payment']);
    const shop = await db.query(`select payload from email_notifications where template = 'shop_review_needed' and reservation_id = $1`, [hold.reservation_id]);
    expect(shop[0].payload.reason).toBe('duplicate_balance_payment');
  });

  it('el pago diferido del resto mantiene la reserva y vuelve a "pendiente" si falla', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);
    const now = daysAfter(LAUNCH, 2);
    const s = fakeSessionId();
    await db.rpc('presale_attach_balance_checkout', {
      p_reservation_id: hold.reservation_id, p_session_id: s, p_amount_cents: 109000,
      p_expires_at: minutesAfter(now, 60), p_now: now,
    });
    const proc = await db.rpc<any>('presale_confirm_balance', {
      p_session_id: s, p_payment_intent_id: 'pi_sepa', p_amount_cents: 109000, p_currency: 'eur',
      p_paid: false, p_now: now,
    });
    expect(proc.result).toBe('processing');
    expect((await reservation(hold.reservation_id)).status).toBe('balance_processing');
    await db.rpc('presale_checkout_closed', { p_session_id: s, p_reason: 'payment_failed', p_now: daysAfter(now, 3) });
    expect((await reservation(hold.reservation_id)).status).toBe('balance_due');
  });
});

describe('recordatorios y caducidad', () => {
  it('día 15 → recordatorio · día 25 → aviso · sin duplicados', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);

    await db.rpc('presale_run_maintenance', { p_now: daysAfter(LAUNCH, 14) });
    expect((await templatesFor(hold.reservation_id)).map((n) => n.template)).not.toContain('balance_reminder');

    await db.rpc('presale_run_maintenance', { p_now: daysAfter(LAUNCH, 15) });
    await db.rpc('presale_run_maintenance', { p_now: minutesAfter(daysAfter(LAUNCH, 15), 5) });
    await db.rpc('presale_run_maintenance', { p_now: daysAfter(LAUNCH, 25) });
    await db.rpc('presale_run_maintenance', { p_now: daysAfter(LAUNCH, 26) });

    const notes = (await templatesFor(hold.reservation_id)).filter((n) => ['balance_reminder', 'expiry_warning'].includes(n.template));
    expect(notes).toEqual([
      { template: 'balance_reminder', is_bulk: true },
      { template: 'expiry_warning', is_bulk: true },
    ]);
  });

  it('si el cron estuvo parado, no manda el recordatorio atrasado: solo el aviso final', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);
    await db.rpc('presale_run_maintenance', { p_now: daysAfter(LAUNCH, 27) });
    const t = (await templatesFor(hold.reservation_id)).map((n) => n.template);
    expect(t).toContain('expiry_warning');
    expect(t).not.toContain('balance_reminder');
  });

  it('día 30: caduca, libera stock para venta directa y NO retiene la señal por defecto', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 1 });
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);
    expect(await available(batchId, daysAfter(LAUNCH, 29))).toBe(0);

    const res = await db.rpc<any>('presale_run_maintenance', { p_now: minutesAfter(daysAfter(LAUNCH, 30), 1) });
    expect(res.reservations_expired).toBeGreaterThanOrEqual(1);

    const r = await reservation(hold.reservation_id);
    expect(r).toMatchObject({ status: 'expired', deposit_status: 'paid' });
    const [a] = await db.query('select status, release_reason from inventory_allocations where reservation_id = $1', [hold.reservation_id]);
    expect(a).toEqual({ status: 'released', release_reason: 'reservation_expired' });
    expect(await available(batchId, daysAfter(LAUNCH, 31))).toBe(1);
    expect((await templatesFor(hold.reservation_id)).map((n) => n.template)).toContain('reservation_expired');

    // Enlaces antiguos: ya no se puede iniciar el pago.
    const begin = await db.rpc<any>('presale_balance_checkout_begin', { p_reservation_id: hold.reservation_id, p_now: daysAfter(LAUNCH, 31) });
    expect(begin).toMatchObject({ ok: false, reason: 'not_payable' });
  });

  it('el pago se bloquea exactamente en la fecha límite aunque el cron no haya pasado', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);
    const due = daysAfter(LAUNCH, 30);
    expect((await db.rpc<any>('presale_balance_checkout_begin', { p_reservation_id: hold.reservation_id, p_now: minutesAfter(due, -1) })).ok).toBe(true);
    expect(await db.rpc<any>('presale_balance_checkout_begin', { p_reservation_id: hold.reservation_id, p_now: due }))
      .toMatchObject({ ok: false, reason: 'deadline_passed' });
  });

  it('no caduca mientras haya un checkout del resto que aún puede cobrarse', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);
    const due = daysAfter(LAUNCH, 30);
    const s = fakeSessionId();
    await db.rpc('presale_attach_balance_checkout', {
      p_reservation_id: hold.reservation_id, p_session_id: s, p_amount_cents: 109000,
      p_expires_at: minutesAfter(due, 30), p_now: minutesAfter(due, -10),
    });

    await db.rpc('presale_run_maintenance', { p_now: minutesAfter(due, 5) });
    expect((await reservation(hold.reservation_id)).status).toBe('balance_due');

    // Paga dentro de la sesión abierta (5 minutos después del límite).
    const paid = await db.rpc<any>('presale_confirm_balance', {
      p_session_id: s, p_payment_intent_id: 'pi_edge', p_amount_cents: 109000, p_currency: 'eur',
      p_paid: true, p_now: minutesAfter(due, 6),
    });
    expect(paid.result).toBe('completed');
  });

  it('pago simultáneo a la caducidad: se respeta el pago si la plaza sigue libre', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 2 });
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);
    const due = daysAfter(LAUNCH, 30);
    const s = fakeSessionId();
    // Sesión que terminó justo en la fecha límite; el webhook llega tarde.
    await db.rpc('presale_attach_balance_checkout', {
      p_reservation_id: hold.reservation_id, p_session_id: s, p_amount_cents: 109000,
      p_expires_at: due, p_now: minutesAfter(due, -40),
    });
    await db.rpc('presale_run_maintenance', { p_now: minutesAfter(due, 1) });
    expect((await reservation(hold.reservation_id)).status).toBe('expired');

    const late = await db.rpc<any>('presale_confirm_balance', {
      p_session_id: s, p_payment_intent_id: 'pi_late', p_amount_cents: 109000, p_currency: 'eur',
      p_paid: true, p_now: minutesAfter(due, 20),
    });
    expect(late.result).toBe('completed');
    expect((await reservation(hold.reservation_id)).status).toBe('completed');
  });

  it('pago tardío tras caducar, sin plaza (ya vendida): revisión manual, nunca sobreventa', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 1 });
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);
    const due = daysAfter(LAUNCH, 30);
    const s = fakeSessionId();
    await db.rpc('presale_attach_balance_checkout', {
      p_reservation_id: hold.reservation_id, p_session_id: s, p_amount_cents: 109000,
      p_expires_at: due, p_now: minutesAfter(due, -40),
    });
    await db.rpc('presale_run_maintenance', { p_now: minutesAfter(due, 1) });

    // La plaza liberada se vende en venta directa.
    const { line } = directLine(VARIANT_300, 1);
    const direct = await db.rpc<any>('presale_direct_hold', {
      p_batch_id: batchId, p_line: line, p_hold_minutes: HOLD_MINUTES, p_now: minutesAfter(due, 2),
    });
    expect(direct.ok).toBe(true);

    const late = await db.rpc<any>('presale_confirm_balance', {
      p_session_id: s, p_payment_intent_id: 'pi_late', p_amount_cents: 109000, p_currency: 'eur',
      p_paid: true, p_now: minutesAfter(due, 20),
    });
    expect(late).toMatchObject({ result: 'needs_review', review_reason: 'paid_after_expiry_without_stock' });
  });

  it('política "refund": marca la señal para devolver (el reembolso lo ejecuta el admin)', async () => {
    const batchId = await createBatch(db.rpc, { expiry_deposit_policy: 'refund' });
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);
    await db.rpc('presale_run_maintenance', { p_now: daysAfter(LAUNCH, 31) });
    expect((await reservation(hold.reservation_id)).deposit_status).toBe('refund_pending');
  });

  it('política "retain" exige condiciones validadas legalmente', async () => {
    const created = await db.rpc<any>('presale_admin_create_batch', {
      p_fields: { code: 'retain-no-legal', name: 'Retain', capacity_sets: 5, expiry_deposit_policy: 'retain' },
    });
    expect(created).toMatchObject({ ok: false, reason: 'invalid_fields' });

    const batchId = await createBatch(db.rpc, { expiry_deposit_policy: 'retain', policies_legally_validated: true });
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);
    await db.rpc('presale_run_maintenance', { p_now: daysAfter(LAUNCH, 31) });
    expect((await reservation(hold.reservation_id)).deposit_status).toBe('retained');
  });

  it('la decisión manual de retener la señal exige condiciones validadas al reservar', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);
    await db.rpc('presale_run_maintenance', { p_now: daysAfter(LAUNCH, 31) });
    // Validar ahora la tirada no cambia lo que el cliente aceptó.
    await db.rpc('presale_admin_update_batch', { p_batch_id: batchId, p_fields: { policies_legally_validated: true } });
    expect(await db.rpc<any>('presale_admin_set_deposit_disposition', { p_reservation_id: hold.reservation_id, p_disposition: 'retained' }))
      .toMatchObject({ ok: false, reason: 'policy_not_validated' });
    expect((await db.rpc<any>('presale_admin_set_deposit_disposition', { p_reservation_id: hold.reservation_id, p_disposition: 'refund_pending' })).ok)
      .toBe(true);
  });
});

describe('venta directa', () => {
  it('no se puede comprar antes del lanzamiento', async () => {
    const batchId = await createBatch(db.rpc);
    const { line } = directLine(VARIANT_300, 1);
    expect(await db.rpc<any>('presale_direct_hold', { p_batch_id: batchId, p_line: line, p_hold_minutes: HOLD_MINUTES, p_now: T0 }))
      .toMatchObject({ ok: false, reason: 'direct_sale_not_open' });
  });

  it('cuando solo queda stock reservado no hay venta directa; al caducar, sí', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 1 });
    await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);
    const { line } = directLine(VARIANT_300, 1);
    expect(await db.rpc<any>('presale_direct_hold', { p_batch_id: batchId, p_line: line, p_hold_minutes: HOLD_MINUTES, p_now: daysAfter(LAUNCH, 1) }))
      .toMatchObject({ ok: false, reason: 'insufficient_stock', available: 0 });

    await db.rpc('presale_run_maintenance', { p_now: daysAfter(LAUNCH, 31) });
    expect((await db.rpc<any>('presale_direct_hold', { p_batch_id: batchId, p_line: line, p_hold_minutes: HOLD_MINUTES, p_now: daysAfter(LAUNCH, 31) })).ok)
      .toBe(true);
  });

  it('precio completo sin descuento, pedido directo y plaza vendida que nunca se libera', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 3 });
    await launch(db.rpc, batchId, LAUNCH);
    const { line, quote } = directLine(VARIANT_300, 2);
    expect(quote.totalCents).toBe(240000);
    const hold = await db.rpc<any>('presale_direct_hold', {
      p_batch_id: batchId, p_line: line, p_hold_minutes: HOLD_MINUTES, p_now: LAUNCH,
    });
    const session = fakeSessionId();
    expect((await db.rpc<any>('presale_attach_checkout', {
      p_allocation_id: hold.allocation_id, p_session_id: session, p_amount_cents: 240000,
      p_expires_at: minutesAfter(LAUNCH, 31), p_now: LAUNCH,
    })).ok).toBe(true);

    const res = await db.rpc<any>('presale_confirm_direct', {
      p_session_id: session, p_payment_intent_id: 'pi_direct', p_amount_cents: 240000, p_currency: 'eur',
      p_paid: true, p_customer: { email: 'direct@example.com', name: 'Comprador', phone: '600' },
      p_shipping: { name: 'Comprador', city: 'Bilbao', country: 'ES' }, p_now: minutesAfter(LAUNCH, 3),
    });
    expect(res.result).toBe('confirmed');
    const [order] = await db.query('select * from orders where id = $1', [res.order_id]);
    expect(order).toMatchObject({ kind: 'direct', amount_total_cents: 240000, customer_email: 'direct@example.com', discount_cents: 0 });
    const [item] = await db.query('select quantity, sets from order_items where order_id = $1', [order.id]);
    expect(item).toEqual({ quantity: 8, sets: 2 });

    // Ni el mantenimiento ni la cancelación de la tirada liberan una plaza vendida.
    await db.rpc('presale_run_maintenance', { p_now: daysAfter(LAUNCH, 90) });
    await db.rpc('presale_cancel_batch', { p_batch_id: batchId, p_reason: 'prueba', p_now: daysAfter(LAUNCH, 91) });
    const [a] = await db.query('select status from inventory_allocations where id = $1', [hold.allocation_id]);
    expect(a.status).toBe('sold');

    // Duplicado del webhook → sin segundo pedido.
    const dup = await db.rpc<any>('presale_confirm_direct', {
      p_session_id: session, p_payment_intent_id: 'pi_direct', p_amount_cents: 240000, p_currency: 'eur',
      p_paid: true, p_now: minutesAfter(LAUNCH, 5),
    });
    expect(dup.result).toBe('already');
  });

  it('el admin puede liberar la plaza de un pedido cancelado (unidad devuelta)', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 1 });
    await launch(db.rpc, batchId, LAUNCH);
    const { line } = directLine(VARIANT_300, 1);
    const hold = await db.rpc<any>('presale_direct_hold', { p_batch_id: batchId, p_line: line, p_hold_minutes: HOLD_MINUTES, p_now: LAUNCH });
    const session = fakeSessionId();
    await db.rpc('presale_attach_checkout', { p_allocation_id: hold.allocation_id, p_session_id: session, p_amount_cents: 120000, p_expires_at: minutesAfter(LAUNCH, 31), p_now: LAUNCH });
    const res = await db.rpc<any>('presale_confirm_direct', {
      p_session_id: session, p_payment_intent_id: 'pi_c', p_amount_cents: 120000, p_currency: 'eur', p_paid: true,
      p_customer: { email: 'c@example.com' }, p_now: minutesAfter(LAUNCH, 1),
    });
    expect(await available(batchId, daysAfter(LAUNCH, 1))).toBe(0);
    const cancel = await db.rpc<any>('presale_admin_cancel_order', { p_order_id: res.order_id, p_reason: 'Desistimiento', p_release_stock: true });
    expect(cancel).toMatchObject({ ok: true, allocations_released: 1 });
    expect(await available(batchId, daysAfter(LAUNCH, 1))).toBe(1);
  });
});

describe('cancelaciones y devoluciones', () => {
  it('tirada cancelada: reservas canceladas, señal marcada para devolver, retenciones liberadas', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold: paid } = await reserveAndPay(db.rpc, batchId, { email: 'paid@example.com' });
    const pending = await reserve(db.rpc, batchId, { email: 'pending@example.com', now: minutesAfter(T0, 10) });
    const res = await db.rpc<any>('presale_cancel_batch', { p_batch_id: batchId, p_reason: 'Proveedor', p_now: minutesAfter(T0, 15) });
    expect(res).toMatchObject({ ok: true, reservations_cancelled: 1, checkouts_abandoned: 1 });

    expect(await reservation(paid.reservation_id)).toMatchObject({ status: 'cancelled', deposit_status: 'refund_pending' });
    expect((await reservation(pending.reservation_id)).status).toBe('abandoned');
    const allocations = await db.query(`select status from inventory_allocations where batch_id = $1`, [batchId]);
    expect(allocations.every((a) => a.status === 'released')).toBe(true);
    expect((await templatesFor(paid.reservation_id)).map((n) => n.template)).toContain('reservation_cancelled');
  });

  it('el reembolso de la señal se registra una vez y es monótono (eventos fuera de orden)', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold, session } = await reserveAndPay(db.rpc, batchId);
    const cancel = await db.rpc<any>('presale_admin_cancel_reservation', {
      p_reservation_id: hold.reservation_id, p_reason: 'Solicitud del cliente', p_refund_deposit: true,
    });
    expect(cancel).toMatchObject({ ok: true, status: 'cancelled', deposit_status: 'refund_pending', deposit_payment_intent_id: `pi_${session}` });

    const first = await db.rpc<any>('presale_record_refund', { p_payment_intent_id: `pi_${session}`, p_refunded_total_cents: 5000 });
    expect(first.result).toBe('recorded');
    const stale = await db.rpc<any>('presale_record_refund', { p_payment_intent_id: `pi_${session}`, p_refunded_total_cents: 2000 });
    expect(stale.result).toBe('already');
    expect((await reservation(hold.reservation_id)).deposit_status).toBe('refunded');
    const [p] = await db.query(`select status, refunded_cents from payments where stripe_checkout_session_id = $1`, [session]);
    expect(p).toEqual({ status: 'refunded', refunded_cents: 5000 });
    expect((await templatesFor(hold.reservation_id)).map((n) => n.template)).toContain('refund_issued');
  });

  it('no se puede cancelar una reserva con un pago en curso ni una ya completada', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold } = await reserveAndPay(db.rpc, batchId);
    await launch(db.rpc, batchId, LAUNCH);
    await payBalance(db.rpc, hold.reservation_id, { now: daysAfter(LAUNCH, 1) });
    expect(await db.rpc<any>('presale_admin_cancel_reservation', { p_reservation_id: hold.reservation_id, p_reason: 'x', p_refund_deposit: true }))
      .toMatchObject({ ok: false, reason: 'use_order_cancellation' });
  });
});
