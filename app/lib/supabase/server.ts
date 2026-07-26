/**
 * Cliente de Supabase para el SERVIDOR (service-role).
 *
 * Solo se usa en `.server.ts` (webhook de Stripe → guardar pedidos). La
 * service-role key SALTA RLS, así que NUNCA debe llegar al cliente. Se
 * instancia de forma perezosa para que build/SSR no fallen si Supabase no
 * está configurado; el error solo salta al usarlo.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, requireEnv } from '~/lib/env.server';

let _client: SupabaseClient | null = null;

/** `true` si Supabase está configurado (sin instanciar el cliente). */
export function isSupabaseConfigured(): boolean {
  return Boolean(env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY'));
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _client;
}
