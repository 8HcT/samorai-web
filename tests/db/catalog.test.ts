/**
 * Control del catálogo (stock, visibilidad, etiquetas) contra PostgreSQL real
 * (migración 20261120100000_catalog_control.sql).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asRole, createTestDb, type TestDb } from '../helpers/db';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.close();
});

const ACTOR = '00000000-0000-4000-8000-000000000001';
const V1 = 'victoria-anthracite-grey-18x9-et35';
const V2 = 'victoria-anthracite-grey-18x8-5-et35';
const item = (variant_id: string, quantity: number, finish_id = 'anthracite-grey') => ({
  variant_id,
  quantity,
  product_slug: 'victoria',
  finish_id,
});
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
let seq = 0;
const key = () => `hold_test_${Date.now().toString(36)}_${seq++}`;
const stockOf = async (v: string) =>
  (await db.query<{ stock: number | null }>('select stock from catalog_variants where variant_id = $1', [v]))[0]?.stock;

describe('catálogo: lectura y panel', () => {
  it('sin filas: umbral por defecto y nada configurado', async () => {
    const snap = await db.rpc<any>('catalog_public_snapshot');
    expect(snap).toMatchObject({ low_stock_threshold: 8, finishes: [], variants: [] });
  });

  it('guardar stock y estado de una referencia queda auditado; repetirlo no cambia nada', async () => {
    expect(await db.rpc<any>('catalog_admin_set_variant', { p_variant_id: V1, p_stock: 12, p_active: true, p_actor: ACTOR })).toMatchObject({ ok: true, changed: true });
    expect(await db.rpc<any>('catalog_admin_set_variant', { p_variant_id: V1, p_stock: 12, p_active: true, p_actor: ACTOR })).toMatchObject({ ok: true, changed: false });
    const audits = await db.query(`select action, data from audit_events where entity_type = 'catalog' and entity_id = $1`, [V1]);
    expect(audits).toHaveLength(1);
    expect(audits[0].data).toMatchObject({ from: null, to: { stock: 12, active: true } });
  });

  it('rechaza datos absurdos', async () => {
    expect(await db.rpc<any>('catalog_admin_set_variant', { p_variant_id: V1, p_stock: -1, p_active: true })).toMatchObject({ ok: false, reason: 'invalid_stock' });
    expect(await db.rpc<any>('catalog_admin_set_variant', { p_variant_id: 'Mal ID!', p_stock: 1, p_active: true })).toMatchObject({ ok: false, reason: 'invalid_fields' });
    expect(await db.rpc<any>('catalog_admin_set_finish', { p_product_slug: 'victoria', p_finish_id: 'anthracite-grey', p_visible: true, p_hide_when_sold_out: false, p_label_code: 'Nuevo!' })).toMatchObject({ ok: false });
    expect(await db.rpc<any>('catalog_admin_set_threshold', { p_value: -3 })).toMatchObject({ ok: false });
  });

  it('acabado: visibilidad y etiqueta (código)', async () => {
    expect(await db.rpc<any>('catalog_admin_set_finish', { p_product_slug: 'victoria', p_finish_id: 'black-metallic', p_visible: true, p_hide_when_sold_out: true, p_label_code: 'new', p_actor: ACTOR })).toMatchObject({ ok: true });
    await db.rpc('catalog_admin_set_threshold', { p_value: 4, p_actor: ACTOR });
    const snap = await db.rpc<any>('catalog_public_snapshot');
    expect(snap.low_stock_threshold).toBe(4);
    expect(snap.finishes).toContainEqual({ product_slug: 'victoria', finish_id: 'black-metallic', visible: true, hide_when_sold_out: true, label_code: 'new' });
    await db.rpc('catalog_admin_set_threshold', { p_value: 8, p_actor: ACTOR });
  });
});

describe('catálogo: stock durante la compra', () => {
  it('aparta todo o nada: si una línea no cabe, no queda nada apartado', async () => {
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V1, p_stock: 4, p_active: true });
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V2, p_stock: 2, p_active: true });
    const k = key();
    const res = await db.rpc<any>('catalog_reserve', { p_hold_key: k, p_items: [item(V1, 4), item(V2, 4)], p_expires_at: inMinutes(30) });
    expect(res).toMatchObject({ ok: false, reason: 'unavailable', short: [{ variant_id: V2, available: 2, reason: 'stock' }] });
    expect(await db.query(`select * from stock_holds where hold_key = $1 and status = 'held'`, [k])).toHaveLength(0);
  });

  it('lo apartado no se puede vender a otro hasta que caduca o se libera', async () => {
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V1, p_stock: 4, p_active: true });
    const a = key();
    const b = key();
    expect(await db.rpc<any>('catalog_reserve', { p_hold_key: a, p_items: [item(V1, 4)], p_expires_at: inMinutes(30) })).toMatchObject({ ok: true });
    expect(await db.rpc<any>('catalog_reserve', { p_hold_key: b, p_items: [item(V1, 1)], p_expires_at: inMinutes(30) })).toMatchObject({ ok: false, short: [{ available: 0 }] });
    const snap = await db.rpc<any>('catalog_public_snapshot');
    expect(snap.variants.find((v: any) => v.variant_id === V1)).toMatchObject({ stock: 4, held: 4 });

    expect(await db.rpc<any>('catalog_release', { p_hold_key: a })).toMatchObject({ released: 1 });
    expect(await db.rpc<any>('catalog_reserve', { p_hold_key: b, p_items: [item(V1, 1)], p_expires_at: inMinutes(30) })).toMatchObject({ ok: true });
    await db.rpc('catalog_release', { p_hold_key: b });
  });

  it('una reserva caducada ya no aparta nada', async () => {
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V1, p_stock: 4, p_active: true });
    const old = key();
    await db.rpc('catalog_reserve', { p_hold_key: old, p_items: [item(V1, 4)], p_expires_at: inMinutes(30) });
    await db.query(`update stock_holds set expires_at = now() - interval '1 minute' where hold_key = $1`, [old]);
    expect(await db.rpc<any>('catalog_reserve', { p_hold_key: key(), p_items: [item(V1, 4)], p_expires_at: inMinutes(30) })).toMatchObject({ ok: true });
    await db.query(`update stock_holds set status = 'released' where status = 'held'`);
  });

  it('dos pagos a la vez por las últimas 4 llantas: solo uno las consigue', async () => {
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V1, p_stock: 4, p_active: true });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => db.rpc<any>('catalog_reserve', { p_hold_key: key(), p_items: [item(V1, 4)], p_expires_at: inMinutes(30) }))
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    await db.query(`update stock_holds set status = 'released' where status = 'held'`);
  });

  it('cobrado: descuenta una sola vez aunque el webhook se repita', async () => {
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V1, p_stock: 10, p_active: true });
    const k = key();
    await db.rpc('catalog_reserve', { p_hold_key: k, p_items: [item(V1, 4)], p_expires_at: inMinutes(30) });
    const items = [{ variant_id: V1, quantity: 4 }];
    const [first, second] = await Promise.all([
      db.rpc<any>('catalog_commit', { p_hold_key: k, p_items: items }),
      db.rpc<any>('catalog_commit', { p_hold_key: k, p_items: items }),
    ]);
    expect(first.committed + second.committed).toBe(1);
    expect(await stockOf(V1)).toBe(6);
    expect(await db.rpc<any>('catalog_commit', { p_hold_key: k, p_items: items })).toMatchObject({ committed: 0, oversold: [] });
    expect(await stockOf(V1)).toBe(6);
    // Ya no cuenta como apartado.
    const snap = await db.rpc<any>('catalog_public_snapshot');
    expect(snap.variants.find((v: any) => v.variant_id === V1).held).toBe(0);
  });

  it('venta sin reserva previa (pago creado antes de activar el stock) también descuenta', async () => {
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V2, p_stock: 8, p_active: true });
    const res = await db.rpc<any>('catalog_commit', { p_hold_key: 'cs_live_sin_reserva_1', p_items: [{ variant_id: V2, quantity: 4 }] });
    expect(res).toMatchObject({ committed: 1, oversold: [] });
    expect(await stockOf(V2)).toBe(4);
  });

  it('si ya no quedaba stock, lo avisa (para revisar el pedido) y deja el stock a 0', async () => {
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V2, p_stock: 2, p_active: true });
    const res = await db.rpc<any>('catalog_commit', { p_hold_key: key(), p_items: [{ variant_id: V2, quantity: 4 }] });
    expect(res.oversold).toEqual([{ variant_id: V2, missing: 2 }]);
    expect(await stockOf(V2)).toBe(0);
  });

  it('referencias sin control de stock: se venden sin límite y no descuentan', async () => {
    const res = await db.rpc<any>('catalog_reserve', { p_hold_key: key(), p_items: [item('victoria-silver-metallic-18x9-et35', 400, 'silver-metallic')], p_expires_at: inMinutes(30) });
    expect(res).toMatchObject({ ok: true });
    const c = await db.rpc<any>('catalog_commit', { p_hold_key: key(), p_items: [{ variant_id: 'victoria-silver-metallic-18x9-et35', quantity: 4 }] });
    expect(c).toMatchObject({ committed: 0, oversold: [] });
  });

  it('referencia desactivada o acabado oculto: no se puede comprar', async () => {
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V1, p_stock: 10, p_active: false });
    expect(await db.rpc<any>('catalog_reserve', { p_hold_key: key(), p_items: [item(V1, 1)], p_expires_at: inMinutes(30) })).toMatchObject({ ok: false, short: [{ reason: 'inactive' }] });
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V1, p_stock: 10, p_active: true });

    await db.rpc('catalog_admin_set_finish', { p_product_slug: 'victoria', p_finish_id: 'anthracite-grey', p_visible: false, p_hide_when_sold_out: false, p_label_code: null });
    expect(await db.rpc<any>('catalog_reserve', { p_hold_key: key(), p_items: [item(V1, 1)], p_expires_at: inMinutes(30) })).toMatchObject({ ok: false, short: [{ reason: 'hidden' }] });
    await db.rpc('catalog_admin_set_finish', { p_product_slug: 'victoria', p_finish_id: 'anthracite-grey', p_visible: true, p_hide_when_sold_out: false, p_label_code: null });
  });

  it('pago diferido: la reserva se alarga', async () => {
    await db.rpc('catalog_admin_set_variant', { p_variant_id: V1, p_stock: 4, p_active: true });
    const k = key();
    await db.rpc('catalog_reserve', { p_hold_key: k, p_items: [item(V1, 4)], p_expires_at: inMinutes(30) });
    expect(await db.rpc<any>('catalog_extend', { p_hold_key: k, p_expires_at: inMinutes(60 * 24 * 7) })).toMatchObject({ extended: 1 });
    const [row] = await db.query(`select expires_at from stock_holds where hold_key = $1`, [k]);
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600_000);
    await db.rpc('catalog_release', { p_hold_key: k });
  });

  it('el panel ve las unidades vendidas (pedidos cobrados, no anulados)', async () => {
    const [o] = await db.query(
      `insert into orders (stripe_session_id, amount_total_cents, currency, payment_status, status) values ('cs_test_vendidas', 120000, 'eur', 'paid', 'paid') returning id`
    );
    await db.query(`insert into order_items (order_id, variant_id, product_name, quantity, unit_price_cents) values ($1, $2, 'Victoria', 4, 30000)`, [o.id, V1]);
    const [x] = await db.query(
      `insert into orders (stripe_session_id, amount_total_cents, currency, payment_status, status) values ('cs_test_anulada', 120000, 'eur', 'paid', 'cancelled') returning id`
    );
    await db.query(`insert into order_items (order_id, variant_id, product_name, quantity, unit_price_cents) values ($1, $2, 'Victoria', 4, 30000)`, [x.id, V1]);
    const overview = await db.rpc<any>('catalog_admin_overview');
    expect(overview.sold[V1]).toBe(4);
  });
});

describe('promociones: etiqueta en inglés', () => {
  it('se guarda aparte y sale en los precios públicos', async () => {
    const res = await db.rpc<any>('pricing_admin_save_promotion', {
      p_id: null,
      p_fields: { name: 'Rebajas', badge: 'Rebajas', percent_off: 15, starts_at: '2026-01-01T00:00:00Z', ends_at: '2030-01-01T00:00:00Z', product_slugs: [], finish_ids: [], active: true },
    });
    expect(await db.rpc<any>('pricing_admin_set_promotion_badge_en', { p_id: res.id, p_badge_en: 'Sale' })).toMatchObject({ ok: true });
    const snap = await db.rpc<any>('pricing_public_snapshot');
    expect(snap.promotions[0]).toMatchObject({ badge: 'Rebajas', badge_en: 'Sale' });
    await db.query('delete from promotions');
  });
});

describe('catálogo: permisos', () => {
  it('anon no puede leer las tablas ni llamar a las funciones', async () => {
    for (const table of ['catalog_variants', 'catalog_finishes', 'stock_holds', 'store_settings']) {
      await expect(asRole(db.pool, 'anon', null, (c) => c.query(`select * from ${table}`))).rejects.toThrow(/permission denied/);
    }
    await expect(asRole(db.pool, 'anon', null, (c) => c.query(`select catalog_public_snapshot()`))).rejects.toThrow(/permission denied/);
    await expect(
      asRole(db.pool, 'authenticated', null, (c) => c.query(`select catalog_admin_set_variant('x', 1, true)`))
    ).rejects.toThrow(/permission denied/);
  });
});
