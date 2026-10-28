/**
 * Supabase Auth en el servidor (React Router SSR) con sesión en cookies.
 *
 * · Registro OPCIONAL: todo el flujo de compra funciona sin sesión.
 * · Se usa la clave pública (anon/publishable) — la service-role nunca se
 *   mezcla con la sesión del usuario.
 * · Las cookies son httpOnly + SameSite=Lax (+ Secure en producción): el
 *   navegador no puede leer el token y no viaja en peticiones de otros sitios.
 * · Cada loader/action crea su propio cliente y devuelve `headers` para que
 *   los refrescos de sesión lleguen al navegador.
 */
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { redirect } from 'react-router';
import { env, isProduction } from '~/lib/env.server';
import { getSupabaseAdmin } from '~/lib/supabase/server';

export function supabaseAnonKey(): string | undefined {
  return env('SUPABASE_ANON_KEY') ?? env('SUPABASE_PUBLISHABLE_KEY');
}

/** Auth disponible (URL + clave pública configuradas). */
export function isAuthConfigured(): boolean {
  return Boolean(env('SUPABASE_URL') && supabaseAnonKey());
}

export interface AuthContext {
  supabase: SupabaseClient;
  /** Set-Cookie / Cache-Control a devolver en la respuesta. */
  headers: Headers;
}

export function createAuthClient(request: Request): AuthContext {
  const url = env('SUPABASE_URL');
  const key = supabaseAnonKey();
  if (!url || !key) {
    throw new Error('Supabase Auth no está configurado (SUPABASE_URL / SUPABASE_ANON_KEY).');
  }
  const headers = new Headers();
  const supabase = createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction(),
      path: '/',
    },
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('Cookie') ?? '').map((c) => ({
          name: c.name,
          value: c.value ?? '',
        }));
      },
      setAll(cookies, cacheHeaders) {
        for (const { name, value, options } of cookies) {
          headers.append('Set-Cookie', serializeCookieHeader(name, value, options));
        }
        for (const [name, value] of Object.entries(cacheHeaders ?? {})) {
          headers.set(name, value);
        }
      },
    },
  });
  return { supabase, headers };
}

/** ¿Hay alguna cookie de sesión de Supabase? (evita llamadas inútiles a Auth). */
export function hasAuthCookie(request: Request): boolean {
  const cookie = request.headers.get('Cookie') ?? '';
  return /(?:^|;\s*)sb-[^=]+-auth-token/.test(cookie);
}

export interface SessionUser {
  user: User | null;
  auth: AuthContext | null;
}

/**
 * Usuario de la sesión, validado contra Supabase Auth (getUser verifica el
 * JWT en el servidor de Auth; no se confía en el contenido de la cookie).
 */
export async function getSessionUser(request: Request): Promise<SessionUser> {
  if (!isAuthConfigured() || !hasAuthCookie(request)) return { user: null, auth: null };
  const auth = createAuthClient(request);
  try {
    const { data, error } = await auth.supabase.auth.getUser();
    if (error || !data.user) return { user: null, auth };
    return { user: data.user, auth };
  } catch (err) {
    console.error('[auth] no se pudo validar la sesión', err);
    return { user: null, auth };
  }
}

function loginRedirect(request: Request): Response {
  const url = new URL(request.url);
  const next = `${url.pathname}${url.search}`;
  return redirect(`/cuenta/acceso?next=${encodeURIComponent(next)}`);
}

export async function requireUser(request: Request): Promise<{ user: User; auth: AuthContext }> {
  const { user, auth } = await getSessionUser(request);
  if (!user || !auth) throw loginRedirect(request);
  return { user, auth };
}

export interface AdminContext {
  user: User;
  auth: AuthContext;
}

/**
 * Autorización del panel en el servidor: sesión válida + `profiles.role =
 * 'admin'` leído con la service-role (el rol nunca viene del navegador).
 * Debe llamarse en el loader Y en la action de cada ruta de /admin.
 */
export async function requireAdmin(request: Request): Promise<AdminContext> {
  const { user, auth } = await requireUser(request);
  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    console.error('[auth][admin] no se pudo leer el perfil', error);
    throw new Response('No se pudo verificar el acceso', { status: 503 });
  }
  if (data?.role !== 'admin') {
    throw new Response('Acceso restringido', { status: 403 });
  }
  return { user, auth };
}
