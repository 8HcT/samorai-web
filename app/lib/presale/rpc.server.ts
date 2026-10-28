/**
 * Acceso a las funciones transaccionales de la base de datos (solo servidor).
 *
 * Toda escritura de preventa, stock y pagos pasa por funciones PL/pgSQL
 * (supabase/migrations/20261020100400_presale_functions.sql) invocadas con la
 * service-role. `Rpc` es una interfaz mínima para poder inyectar en los tests
 * un adaptador sobre PostgreSQL real con la misma forma que `supabase.rpc`.
 */
import { getSupabaseAdmin, isSupabaseConfigured } from '~/lib/supabase/server';

export type Rpc = <T = unknown>(fn: string, params?: Record<string, unknown>) => Promise<T>;

export class RpcError extends Error {
  readonly fn: string;
  readonly code: string | undefined;
  readonly details: string | undefined;

  constructor(fn: string, error: { message: string; code?: string; details?: string | null }) {
    super(`[rpc ${fn}] ${error.message}`);
    this.name = 'RpcError';
    this.fn = fn;
    this.code = error.code;
    this.details = error.details ?? undefined;
  }
}

/** Cliente RPC con la service-role (salta RLS: usar solo en el servidor). */
export const adminRpc: Rpc = async <T = unknown>(fn: string, params: Record<string, unknown> = {}) => {
  const { data, error } = await getSupabaseAdmin().rpc(fn, params);
  if (error) throw new RpcError(fn, error);
  return data as T;
};

/** `true` si la base de datos de preventa puede usarse (variables presentes). */
export function isPresaleDbConfigured(): boolean {
  return isSupabaseConfigured();
}

/**
 * Error por esquema ausente (migraciones de preventa aún sin aplicar). En ese
 * caso la web sigue funcionando como antes (carrito sin tiradas).
 *   · PGRST202 → función no encontrada · PGRST205 → tabla no encontrada
 *   · 42883 / 42P01 → equivalentes de PostgreSQL
 */
export function isSchemaMissingError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'PGRST202' || code === 'PGRST205' || code === '42883' || code === '42P01';
}
