/**
 * Precios editables y promociones contra PostgreSQL real (migración
 * 20261106100000_pricing_promotions.sql).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { loadPricing } from '~/lib/pricing.server';
import { priceVariant } from '~/lib/pricing';
import { products } from '~/data/products';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.close();
});

const victoria = products.find((p) => p.slug === 'victoria')!;
const v85 = victoria.variants.find((v) => v.width === 8.5)!;
const ACTOR = '00000000-0000-4000-8000-000000000001';

const BF = {
  name: 'Black Friday 2026',
  badge: 'Black Friday',
  percent_off: 20,
  starts_at: '2026-11-27T00:00:00Z',
  ends_at: '2026-12-01T00:00:00Z',
  product_slugs: [],
  finish_ids: [],
  active: true,
};

describe('precios', () => {
  it('la migración siembra los precios actuales de Victoria', async () => {
    const snap = await loadPricing({ rpc: db.rpc, now: new Date('2026-11-06T10:00:00Z') });
    expect(snap.prices).toMatchObject({ 'victoria|8.5': 27500, 'victoria|9': 30000, 'victoria|9.5': 30000 });
    expect(snap.promotions).toEqual([]);
  });

  it('cambiar un precio queda auditado; repetirlo no cambia nada', async () => {
    const res = await db.rpc<any>('pricing_admin_set_price', { p_product_slug: 'victoria', p_width: 8.5, p_unit_price_cents: 26900, p_actor: ACTOR });
    expect(res).toMatchObject({ ok: true, changed: true, from: 27500, to: 26900 });
    const again = await db.rpc<any>('pricing_admin_set_price', { p_product_slug: 'victoria', p_width: 8.5, p_unit_price_cents: 26900, p_actor: ACTOR });
    expect(again).toMatchObject({ ok: true, changed: false });

    const audits = await db.query(`select action, data from audit_events where entity_type = 'price'`);
    expect(audits).toHaveLength(1);

    const snap = await loadPricing({ rpc: db.rpc });
    expect(priceVariant(snap, 'victoria', v85)?.finalCents).toBe(26900);

    await db.rpc('pricing_admin_set_price', { p_product_slug: 'victoria', p_width: 8.5, p_unit_price_cents: 27500, p_actor: ACTOR });
  });

  it('rechaza importes absurdos', async () => {
    expect(await db.rpc<any>('pricing_admin_set_price', { p_product_slug: 'victoria', p_width: 8.5, p_unit_price_cents: 0 })).toMatchObject({ ok: false, reason: 'invalid_price' });
    expect(await db.rpc<any>('pricing_admin_set_price', { p_product_slug: 'Victoria!', p_width: 8.5, p_unit_price_cents: 1000 })).toMatchObject({ ok: false, reason: 'invalid_fields' });
  });
});

describe('promociones', () => {
  let id: string;

  it('crea Black Friday y solo aparece dentro de sus fechas', async () => {
    const res = await db.rpc<any>('pricing_admin_save_promotion', { p_id: null, p_fields: BF, p_actor: ACTOR });
    expect(res.ok).toBe(true);
    id = res.id;

    const before = await loadPricing({ rpc: db.rpc, now: new Date('2026-11-26T22:59:00Z') });
    expect(before.promotions).toEqual([]);

    const during = await loadPricing({ rpc: db.rpc, now: new Date('2026-11-28T12:00:00Z') });
    expect(during.promotions).toHaveLength(1);
    expect(priceVariant(during, 'victoria', v85, new Date('2026-11-28T12:00:00Z'))).toMatchObject({
      baseCents: 27500,
      finalCents: 22000,
      promotion: { badge: 'Black Friday', percentOff: 20 },
    });

    const after = await loadPricing({ rpc: db.rpc, now: new Date('2026-12-01T00:00:00Z') });
    expect(after.promotions).toEqual([]);
  });

  it('pausada no se aplica; reanudada sí', async () => {
    const during = new Date('2026-11-28T12:00:00Z');
    expect(await db.rpc<any>('pricing_admin_set_promotion_active', { p_id: id, p_active: false, p_actor: ACTOR })).toMatchObject({ ok: true });
    expect((await loadPricing({ rpc: db.rpc, now: during })).promotions).toEqual([]);
    await db.rpc('pricing_admin_set_promotion_active', { p_id: id, p_active: true, p_actor: ACTOR });
    expect((await loadPricing({ rpc: db.rpc, now: during })).promotions).toHaveLength(1);
  });

  it('editar cambia porcentaje y alcance', async () => {
    const res = await db.rpc<any>('pricing_admin_save_promotion', {
      p_id: id,
      p_fields: { ...BF, percent_off: 25, finish_ids: ['silver-metallic'] },
      p_actor: ACTOR,
    });
    expect(res).toMatchObject({ ok: true, id });
    const [row] = await db.query(`select percent_off, finish_ids from promotions where id = $1`, [id]);
    expect(row).toMatchObject({ percent_off: 25, finish_ids: ['silver-metallic'] });
  });

  it('valida los datos', async () => {
    const bad = (fields: object) => db.rpc<any>('pricing_admin_save_promotion', { p_id: null, p_fields: { ...BF, ...fields } });
    expect(await bad({ percent_off: 0 })).toMatchObject({ ok: false, reason: 'invalid_percent' });
    expect(await bad({ percent_off: 91 })).toMatchObject({ ok: false, reason: 'invalid_percent' });
    expect(await bad({ ends_at: BF.starts_at })).toMatchObject({ ok: false, reason: 'invalid_dates' });
    expect(await bad({ starts_at: 'mañana' })).toMatchObject({ ok: false, reason: 'invalid_fields' });
    expect(await bad({ name: '  ' })).toMatchObject({ ok: false, reason: 'invalid_name' });
    expect(await db.rpc<any>('pricing_admin_save_promotion', { p_id: '00000000-0000-4000-8000-0000000000ff', p_fields: BF })).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('eliminar deja rastro en la auditoría', async () => {
    expect(await db.rpc<any>('pricing_admin_delete_promotion', { p_id: id, p_actor: ACTOR })).toMatchObject({ ok: true });
    expect(await db.rpc<any>('pricing_admin_delete_promotion', { p_id: id, p_actor: ACTOR })).toMatchObject({ ok: false, reason: 'not_found' });
    const audits = await db.query<{ action: string }>(`select action from audit_events where entity_type = 'promotion' and entity_id = $1 order by id`, [id]);
    expect(audits.map((a) => a.action)).toEqual(['created', 'deactivated', 'activated', 'updated', 'deleted']);
  });

  it('el navegador (anon/authenticated) no puede leer ni llamar a nada de precios', async () => {
    const rows = await db.query<{ fn: string; anon: boolean; auth: boolean }>(`
      select p.proname as fn,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'pricing\_%'`);
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows.filter((r) => r.anon || r.auth)).toEqual([]);
    const [t] = await db.query<{ anon: boolean }>(`select has_table_privilege('anon', 'public.promotions', 'select') as anon`);
    expect(t.anon).toBe(false);
  });
});
