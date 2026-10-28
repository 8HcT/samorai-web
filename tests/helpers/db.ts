/**
 * Base de datos de test aislada (clon de la plantilla con las migraciones) y
 * un adaptador `rpc` con la MISMA forma que `supabase.rpc`: así el código del
 * servidor se prueba tal cual contra PostgreSQL real.
 */
import pg from 'pg';
import { inject } from 'vitest';
import type { Rpc } from '~/lib/presale/rpc.server';

export interface TestDb {
  pool: pg.Pool;
  rpc: Rpc;
  query: <T extends pg.QueryResultRow = any>(sql: string, params?: unknown[]) => Promise<T[]>;
  close: () => Promise<void>;
}

function serialize(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

export function pgRpc(pool: pg.Pool): Rpc {
  return async <T = unknown>(fn: string, params: Record<string, unknown> = {}) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw new Error(`Nombre de función no válido: ${fn}`);
    const keys = Object.keys(params).filter((k) => params[k] !== undefined);
    const args = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
    const { rows } = await pool.query(`select public.${fn}(${args}) as result`, keys.map((k) => serialize(params[k])));
    return rows[0]?.result as T;
  };
}

let counter = 0;

export async function createTestDb(): Promise<TestDb> {
  const cfg = inject('pg');
  const name = `t_${process.pid}_${Date.now().toString(36)}_${counter++}`;
  const admin = new pg.Client({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: 'postgres' });
  await admin.connect();
  // Clonado en serie: varios CREATE DATABASE simultáneos sobre la misma
  // plantilla pueden chocar; se reintenta brevemente.
  for (let attempt = 0; ; attempt++) {
    try {
      await admin.query(`create database ${name} template ${cfg.template}`);
      break;
    } catch (err) {
      if (attempt >= 20 || !/being accessed by other users/.test((err as Error).message)) throw err;
      await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
    }
  }
  await admin.end();

  const pool = new pg.Pool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: name,
    max: 40,
  });

  return {
    pool,
    rpc: pgRpc(pool),
    query: async (sql, params) => (await pool.query(sql, params as unknown[])).rows,
    close: async () => {
      await pool.end();
      const drop = new pg.Client({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: 'postgres' });
      await drop.connect();
      await drop.query(`drop database if exists ${name} with (force)`);
      await drop.end();
    },
  };
}

/** Ejecuta `fn` con un rol y un usuario concretos (para probar RLS). */
export async function asRole<T>(
  pool: pg.Pool,
  role: 'anon' | 'authenticated',
  userId: string | null,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    if (userId) await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    const result = await fn(client);
    await client.query('rollback');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
