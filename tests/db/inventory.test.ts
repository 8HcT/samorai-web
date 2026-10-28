/**
 * Núcleo de stock y reservas contra PostgreSQL real:
 * capacidad, concurrencia, retenciones que caducan solas, confirmación de
 * la señal (incluidos webhooks duplicados, tardíos y diferidos), cupos e
 * instantánea inmutable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import {
  ALL_VICTORIA_VARIANTS,
  HOLD_MINUTES,
  T0,
  VARIANT_275,
  VARIANT_300,
  VARIANT_SILVER,
  createBatch,
  directLine,
  fakeSessionId,
  minutesAfter,
  reservationPayload,
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

async function offer(batchId: string, now = T0) {
  const offers = await db.rpc<any[]>('presale_public_offers', {
    p_product_slug: 'victoria',
    p_variants: ALL_VICTORIA_VARIANTS,
    p_now: now,
  });
  return offers.find((o) => o.id === batchId);
}

describe('stock de una tirada', () => {
  it('expone la capacidad real y la descuenta con cada retención', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 50 });
    expect((await offer(batchId)).available_sets).toBe(50);

    const hold = await reserve(db.rpc, batchId, { sets: 2 });
    expect(hold.ok).toBe(true);
    expect(hold.available_after).toBe(48);

    const o = await offer(batchId);
    expect(o.available_sets).toBe(48);
    expect(o.held_sets).toBe(2);
    expect(o.variant_available[VARIANT_300]).toBe(48);
    expect(o.presale_window_open).toBe(true);
  });

  it('congela precios con el orden de cálculo de la especificación', async () => {
    const batchId = await createBatch(db.rpc);
    const hold = await reserve(db.rpc, batchId, { variantId: VARIANT_300, sets: 1 });
    const [r] = await db.query('select * from reservations where id = $1', [hold.reservation_id]);
    // 4 × 300 € = 1.200 € → −5 % (60 €) = 1.140 € → −50 € de señal = 1.090 €
    expect(r.unit_price_cents).toBe(30000);
    expect(r.subtotal_cents).toBe(120000);
    expect(r.discount_bps).toBe(500);
    expect(r.discount_cents).toBe(6000);
    expect(r.total_cents).toBe(114000);
    expect(r.deposit_cents).toBe(5000);
    expect(r.balance_cents).toBe(109000);
    expect(r.status).toBe('pending_deposit');
    expect(r.terms_snapshot.reservation_terms).toContain('condiciones de reserva');
    expect(r.code).toMatch(/^SR-[0-9A-F]{10}$/);
  });

  it('respeta el descuento desactivado de la tirada', async () => {
    const batchId = await createBatch(db.rpc, { presale_discount_enabled: false });
    const { payload } = reservationPayload(VARIANT_275, 1, 'nodiscount@example.com', {
      unitsPerSet: 4,
      discountBps: 0,
      depositPerSetCents: 5000,
    });
    const hold = await db.rpc<any>('presale_reserve_hold', {
      p_batch_id: batchId, p_reservation: payload, p_hold_minutes: HOLD_MINUTES, p_now: T0,
    });
    expect(hold.ok).toBe(true);
    const [r] = await db.query('select subtotal_cents, discount_cents, total_cents, balance_cents from reservations where id = $1', [hold.reservation_id]);
    expect(r).toEqual({ subtotal_cents: 110000, discount_cents: 0, total_cents: 110000, balance_cents: 105000 });
  });

  it('rechaza importes manipulados (descuento, señal o aritmética)', async () => {
    const batchId = await createBatch(db.rpc);
    const base = reservationPayload(VARIANT_300, 1, 'tamper@example.com').payload;

    const tampered = [
      { ...base, discount_bps: 2000, discount_cents: 24000, total_cents: 96000, balance_cents: 91000 },
      { ...base, deposit_cents: 100, balance_cents: 113900 },
    ];
    for (const p of tampered) {
      const res = await db.rpc<any>('presale_reserve_hold', {
        p_batch_id: batchId, p_reservation: p, p_hold_minutes: HOLD_MINUTES, p_now: T0,
      });
      expect(res).toMatchObject({ ok: false, reason: 'pricing_mismatch' });
    }

    // Precio unitario alterado sin cuadrar la aritmética → restricción de la BD.
    await expect(
      db.rpc('presale_reserve_hold', {
        p_batch_id: batchId,
        p_reservation: { ...base, unit_price_cents: 100 },
        p_hold_minutes: HOLD_MINUTES,
        p_now: T0,
      })
    ).rejects.toThrow(/reservations_pricing_chk/);
  });

  it('valida estado, ventana, producto y cantidad máxima', async () => {
    const draft = await createBatch(db.rpc, {}, { open: false });
    expect(await reserve(db.rpc, draft)).toMatchObject({ ok: false, reason: 'presale_not_open' });

    const future = await createBatch(db.rpc, { presale_opens_at: minutesAfter(T0, 60).toISOString() });
    expect(await reserve(db.rpc, future)).toMatchObject({ ok: false, reason: 'presale_window_closed' });

    const limited = await createBatch(db.rpc, { max_sets_per_order: 2 });
    expect(await reserve(db.rpc, limited, { sets: 3 })).toMatchObject({ ok: false, reason: 'invalid_quantity', max: 2 });
  });

  it('no permite abrir la preventa sin las condiciones publicadas', async () => {
    const batchId = await createBatch(db.rpc, { reservation_terms: '', refund_policy: '' }, { open: false });
    const res = await db.rpc<any>('presale_set_batch_status', { p_batch_id: batchId, p_status: 'presale_open', p_now: T0 });
    expect(res).toMatchObject({ ok: false, reason: 'terms_missing' });
  });
});

describe('concurrencia', () => {
  it('dos personas a por la última plaza: solo una la consigue', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 1 });
    const results = await Promise.all([
      reserve(db.rpc, batchId, { email: 'a@example.com' }),
      reserve(db.rpc, batchId, { email: 'b@example.com' }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ reason: 'insufficient_stock', available: 0 });
  });

  it('30 peticiones simultáneas sobre 5 plazas → exactamente 5 retenciones', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 5 });
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => reserve(db.rpc, batchId, { email: `buyer${i}@example.com` }))
    );
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    const [{ occupied }] = await db.query(
      `select coalesce(sum(quantity_sets), 0)::int as occupied from inventory_allocations where batch_id = $1 and status = 'held'`,
      [batchId]
    );
    expect(occupied).toBe(5);
    expect((await offer(batchId)).available_sets).toBe(0);
  });

  it('venta directa y preventa compiten por la misma capacidad sin sobreventa', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 4 });
    // 2 juegos reservados y pagados durante la preventa.
    await reserveAndPay(db.rpc, batchId, { sets: 2, email: 'pre@example.com' });
    await db.rpc('presale_launch_batch', { p_batch_id: batchId, p_now: minutesAfter(T0, 60) });

    const { line } = directLine(VARIANT_300, 1);
    const attempts = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        db.rpc<any>('presale_direct_hold', {
          p_batch_id: batchId,
          p_line: line,
          p_hold_minutes: HOLD_MINUTES,
          p_client_fingerprint: `fp-${i}`,
          p_now: minutesAfter(T0, 61),
        })
      )
    );
    expect(attempts.filter((r) => r.ok)).toHaveLength(2);
  });
});

describe('retenciones temporales', () => {
  it('caducan solas por tiempo, sin depender del cron', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 1 });
    expect((await reserve(db.rpc, batchId, { email: 'first@example.com' })).ok).toBe(true);
    expect(await reserve(db.rpc, batchId, { email: 'second@example.com', now: minutesAfter(T0, 10) }))
      .toMatchObject({ ok: false, reason: 'insufficient_stock' });

    // Pasado el plazo de la retención la plaza vuelve a estar libre…
    const later = minutesAfter(T0, HOLD_MINUTES + 1);
    expect((await offer(batchId, later)).available_sets).toBe(1);
    expect((await reserve(db.rpc, batchId, { email: 'second@example.com', now: later })).ok).toBe(true);
  });

  it('el mantenimiento las marca como liberadas y la reserva como abandonada', async () => {
    const batchId = await createBatch(db.rpc);
    const hold = await reserve(db.rpc, batchId);
    const res = await db.rpc<any>('presale_run_maintenance', { p_now: minutesAfter(T0, HOLD_MINUTES + 1) });
    expect(res.holds_released).toBeGreaterThanOrEqual(1);
    const [a] = await db.query('select status, release_reason from inventory_allocations where id = $1', [hold.allocation_id]);
    expect(a).toEqual({ status: 'released', release_reason: 'hold_expired' });
    const [r] = await db.query('select status from reservations where id = $1', [hold.reservation_id]);
    expect(r.status).toBe('abandoned');
  });

  it('el cliente que abandona Stripe Checkout libera la plaza al momento', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 1 });
    const hold = await reserve(db.rpc, batchId);
    const session = fakeSessionId();
    await db.rpc('presale_attach_checkout', {
      p_allocation_id: hold.allocation_id, p_session_id: session, p_amount_cents: 5000,
      p_expires_at: minutesAfter(T0, 31), p_now: T0,
    });
    const closed = await db.rpc<any>('presale_checkout_closed', {
      p_session_id: session, p_reason: 'checkout_cancelled', p_now: minutesAfter(T0, 3),
    });
    expect(closed).toMatchObject({ ok: true, released: true });
    expect((await offer(batchId, minutesAfter(T0, 4))).available_sets).toBe(1);
    const [p] = await db.query('select status from payments where stripe_checkout_session_id = $1', [session]);
    expect(p.status).toBe('expired');
  });

  it('limita las retenciones simultáneas por email y por cliente (anti-acaparamiento)', async () => {
    const batchId = await createBatch(db.rpc);
    expect((await reserve(db.rpc, batchId, { email: 'same@example.com' })).ok).toBe(true);
    expect((await reserve(db.rpc, batchId, { email: 'SAME@example.com' })).ok).toBe(true);
    expect(await reserve(db.rpc, batchId, { email: 'same@example.com' })).toMatchObject({ ok: false, reason: 'too_many_pending' });

    for (let i = 0; i < 3; i++) {
      expect((await reserve(db.rpc, batchId, { email: `fp${i}@example.com`, fingerprint: 'ip-hash-1' })).ok).toBe(true);
    }
    expect(await reserve(db.rpc, batchId, { email: 'fp9@example.com', fingerprint: 'ip-hash-1' }))
      .toMatchObject({ ok: false, reason: 'too_many_pending' });
  });
});

describe('confirmación de la señal (webhook)', () => {
  it('convierte la retención en reserva y encola los correos una sola vez', async () => {
    const batchId = await createBatch(db.rpc);
    const { hold, session, confirmed } = await reserveAndPay(db.rpc, batchId, { email: 'pay@example.com' });
    expect(confirmed).toMatchObject({ result: 'confirmed', status: 'confirmed' });

    const [a] = await db.query('select status from inventory_allocations where id = $1', [hold.allocation_id]);
    expect(a.status).toBe('reserved');
    const [r] = await db.query('select deposit_status, deposit_paid_at, customer_name from reservations where id = $1', [hold.reservation_id]);
    expect(r.deposit_status).toBe('paid');
    expect(r.customer_name).toBe('Cliente Prueba');

    const templates = (await db.query('select template from email_notifications where reservation_id = $1 order by template', [hold.reservation_id]))
      .map((n) => n.template);
    expect(templates).toEqual(['deposit_receipt', 'reservation_confirmed', 'shop_new_reservation']);

    // Webhook duplicado: sin efectos.
    const again = await db.rpc<any>('presale_confirm_deposit', {
      p_session_id: session, p_payment_intent_id: 'pi_x', p_amount_cents: 5000, p_currency: 'eur',
      p_paid: true, p_now: minutesAfter(T0, 5),
    });
    expect(again.result).toBe('already');
    const [{ n }] = await db.query('select count(*)::int as n from email_notifications where reservation_id = $1', [hold.reservation_id]);
    expect(n).toBe(3);
  });

  it('webhook con retraso: recupera la plaza si sigue libre', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 1 });
    const hold = await reserve(db.rpc, batchId);
    const session = fakeSessionId();
    await db.rpc('presale_attach_checkout', {
      p_allocation_id: hold.allocation_id, p_session_id: session, p_amount_cents: 5000,
      p_expires_at: minutesAfter(T0, 31), p_now: T0,
    });
    await db.rpc('presale_run_maintenance', { p_now: minutesAfter(T0, HOLD_MINUTES + 5) });
    const late = await db.rpc<any>('presale_confirm_deposit', {
      p_session_id: session, p_payment_intent_id: 'pi_late', p_amount_cents: 5000, p_currency: 'eur',
      p_paid: true, p_now: minutesAfter(T0, 120),
    });
    expect(late.result).toBe('confirmed');
    const [a] = await db.query('select status, release_reason from inventory_allocations where id = $1', [hold.allocation_id]);
    expect(a).toEqual({ status: 'reserved', release_reason: null });
  });

  it('webhook con retraso sin plaza libre: queda en revisión, nunca sobreventa', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 1 });
    const hold = await reserve(db.rpc, batchId, { email: 'slow@example.com' });
    const session = fakeSessionId();
    await db.rpc('presale_attach_checkout', {
      p_allocation_id: hold.allocation_id, p_session_id: session, p_amount_cents: 5000,
      p_expires_at: minutesAfter(T0, 31), p_now: T0,
    });
    // La retención caduca y otra persona se queda la plaza.
    const later = minutesAfter(T0, HOLD_MINUTES + 1);
    await reserveAndPay(db.rpc, batchId, { email: 'fast@example.com', now: later });

    const late = await db.rpc<any>('presale_confirm_deposit', {
      p_session_id: session, p_payment_intent_id: 'pi_late2', p_amount_cents: 5000, p_currency: 'eur',
      p_paid: true, p_now: minutesAfter(T0, 180),
    });
    expect(late).toMatchObject({ result: 'needs_review', review_reason: 'paid_without_stock' });
    const [{ occupied }] = await db.query(
      `select coalesce(sum(quantity_sets), 0)::int as occupied from inventory_allocations
        where batch_id = $1 and status in ('reserved', 'sold')`,
      [batchId]
    );
    expect(occupied).toBe(1);
    const shop = await db.query(`select template from email_notifications where reservation_id = $1 and audience = 'shop'`, [hold.reservation_id]);
    expect(shop.map((s) => s.template)).toContain('shop_review_needed');
  });

  it('pago diferido: mantiene la plaza en proceso y la libera si falla', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 1 });
    const hold = await reserve(db.rpc, batchId);
    const session = fakeSessionId();
    await db.rpc('presale_attach_checkout', {
      p_allocation_id: hold.allocation_id, p_session_id: session, p_amount_cents: 5000,
      p_expires_at: minutesAfter(T0, 31), p_now: T0,
    });
    const processing = await db.rpc<any>('presale_confirm_deposit', {
      p_session_id: session, p_payment_intent_id: 'pi_sepa', p_amount_cents: 5000, p_currency: 'eur',
      p_paid: false, p_now: minutesAfter(T0, 5),
    });
    expect(processing.result).toBe('processing');
    // Días después la plaza sigue ocupada (no la libera el tiempo de checkout).
    expect((await offer(batchId, minutesAfter(T0, 60 * 24 * 3))).available_sets).toBe(0);

    const failed = await db.rpc<any>('presale_checkout_closed', {
      p_session_id: session, p_reason: 'payment_failed', p_now: minutesAfter(T0, 60 * 24 * 3),
    });
    expect(failed.released).toBe(true);
    const [r] = await db.query('select status from reservations where id = $1', [hold.reservation_id]);
    expect(r.status).toBe('abandoned');

    // Un "completed" fuera de orden que llegue después no resucita nada.
    const outOfOrder = await db.rpc<any>('presale_confirm_deposit', {
      p_session_id: session, p_payment_intent_id: 'pi_sepa', p_amount_cents: 5000, p_currency: 'eur',
      p_paid: false, p_now: minutesAfter(T0, 60 * 24 * 3 + 1),
    });
    expect(outOfOrder.result).toBe('already');
  });

  it('un importe que no coincide queda en revisión', async () => {
    const batchId = await createBatch(db.rpc);
    const hold = await reserve(db.rpc, batchId);
    const session = fakeSessionId();
    await db.rpc('presale_attach_checkout', {
      p_allocation_id: hold.allocation_id, p_session_id: session, p_amount_cents: 5000,
      p_expires_at: minutesAfter(T0, 31), p_now: T0,
    });
    const res = await db.rpc<any>('presale_confirm_deposit', {
      p_session_id: session, p_payment_intent_id: 'pi_bad', p_amount_cents: 100, p_currency: 'eur',
      p_paid: true, p_now: minutesAfter(T0, 2),
    });
    expect(res).toMatchObject({ result: 'needs_review', review_reason: 'amount_mismatch' });
  });

  it('no deja adjuntar una sesión con un importe distinto al de la señal', async () => {
    const batchId = await createBatch(db.rpc);
    const hold = await reserve(db.rpc, batchId);
    const res = await db.rpc<any>('presale_attach_checkout', {
      p_allocation_id: hold.allocation_id, p_session_id: fakeSessionId(), p_amount_cents: 1,
      p_expires_at: minutesAfter(T0, 31), p_now: T0,
    });
    expect(res).toMatchObject({ ok: false, reason: 'amount_mismatch' });
  });
});

describe('cupos por configuración', () => {
  it('un cupo 0 bloquea una referencia sin afectar al resto', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 10 });
    const q = await db.rpc<any>('presale_admin_upsert_quota', {
      p_batch_id: batchId,
      p_quota: { product_slug: 'victoria', variant_id: VARIANT_SILVER, finish_id: 'silver-metallic', capacity_sets: 0, note: 'No fabricable en esta tirada' },
      p_now: T0,
    });
    expect(q.ok).toBe(true);
    expect(await reserve(db.rpc, batchId, { variantId: VARIANT_SILVER })).toMatchObject({ ok: false, reason: 'insufficient_stock' });
    expect((await reserve(db.rpc, batchId, { variantId: VARIANT_300 })).ok).toBe(true);
    const o = await offer(batchId);
    expect(o.variant_available[VARIANT_SILVER]).toBe(0);
    expect(o.variant_available[VARIANT_300]).toBe(9);
  });

  it('un cupo por acabado limita todas sus referencias', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 10 });
    await db.rpc('presale_admin_upsert_quota', {
      p_batch_id: batchId,
      p_quota: { product_slug: 'victoria', finish_id: 'anthracite-grey', capacity_sets: 2 },
      p_now: T0,
    });
    expect((await reserve(db.rpc, batchId, { variantId: VARIANT_300, email: 'q1@example.com' })).ok).toBe(true);
    expect((await reserve(db.rpc, batchId, { variantId: VARIANT_275, email: 'q2@example.com' })).ok).toBe(true);
    expect(await reserve(db.rpc, batchId, { variantId: VARIANT_275, email: 'q3@example.com' })).toMatchObject({ reason: 'insufficient_stock' });
    expect((await reserve(db.rpc, batchId, { variantId: VARIANT_SILVER, email: 'q4@example.com' })).ok).toBe(true);
  });
});

describe('integridad', () => {
  it('la instantánea de una reserva es inmutable', async () => {
    const batchId = await createBatch(db.rpc);
    const hold = await reserve(db.rpc, batchId);
    await expect(db.query('update reservations set unit_price_cents = 1 where id = $1', [hold.reservation_id]))
      .rejects.toThrow(/inmutable/);
    await expect(db.query('update reservations set finish_name = $2 where id = $1', [hold.reservation_id, 'Otro']))
      .rejects.toThrow(/inmutable/);
    // Los datos de contacto o el estado sí pueden actualizarse.
    await db.query(`update reservations set phone = '600000000' where id = $1`, [hold.reservation_id]);
  });

  it('una plaza vendida no puede volver a liberarse salvo cancelación del pedido', async () => {
    const batchId = await createBatch(db.rpc);
    const hold = await reserve(db.rpc, batchId);
    await db.query(`update inventory_allocations set status = 'sold' where id = $1`, [hold.allocation_id]);
    await expect(
      db.query(`update inventory_allocations set status = 'released', release_reason = 'hold_expired', released_at = now() where id = $1`, [hold.allocation_id])
    ).rejects.toThrow(/no permitida/);
  });

  it('el administrador no puede bajar la capacidad por debajo de lo comprometido', async () => {
    const batchId = await createBatch(db.rpc, { capacity_sets: 10 });
    await reserveAndPay(db.rpc, batchId, { sets: 3, email: 'cap@example.com' });
    const res = await db.rpc<any>('presale_admin_update_batch', {
      p_batch_id: batchId, p_fields: { capacity_sets: 2 }, p_now: minutesAfter(T0, 10),
    });
    expect(res).toMatchObject({ ok: false, reason: 'capacity_below_committed', committed: 3 });

    const ok = await db.rpc<any>('presale_admin_update_batch', {
      p_batch_id: batchId, p_fields: { capacity_sets: 12 }, p_now: minutesAfter(T0, 10),
    });
    expect(ok.ok).toBe(true);
    expect(ok.changes.capacity_sets).toEqual({ from: 10, to: 12 });
    const [audit] = await db.query(`select action from audit_events where entity_id = $1 and action = 'updated'`, [batchId]);
    expect(audit).toBeTruthy();
  });

  it('no se puede quitar de la tirada un modelo con plazas comprometidas', async () => {
    const batchId = await createBatch(db.rpc);
    await reserve(db.rpc, batchId);
    const res = await db.rpc<any>('presale_admin_set_batch_products', { p_batch_id: batchId, p_product_slugs: [] });
    expect(res).toMatchObject({ ok: false, reason: 'product_in_use' });
  });
});
