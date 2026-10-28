/**
 * Utilidades de seguridad para loaders/actions (solo servidor).
 */
import { createHash } from 'node:crypto';
import { env, siteUrl } from '~/lib/env.server';

/**
 * Protección CSRF para acciones que cambian datos: el navegador envía
 * `Origin` (o al menos `Referer`) en los POST; deben coincidir con el sitio.
 * Las cookies de sesión además son SameSite=Lax.
 */
export function assertSameOrigin(request: Request): void {
  const allowed = new Set<string>([new URL(request.url).host]);
  try {
    allowed.add(new URL(siteUrl()).host);
  } catch {
    /* SITE_URL mal formada: se usa solo el host de la petición */
  }

  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  const source = origin && origin !== 'null' ? origin : referer;
  if (!source) {
    throw new Response('Origen de la petición no verificable', { status: 403 });
  }
  let host: string;
  try {
    host = new URL(source).host;
  } catch {
    throw new Response('Origen de la petición no válido', { status: 403 });
  }
  if (!allowed.has(host)) {
    throw new Response('Origen de la petición no permitido', { status: 403 });
  }
}

/** IP del cliente según el proxy de Vercel (o null en local). */
export function clientIp(request: Request): string | null {
  const forwarded =
    request.headers.get('x-vercel-forwarded-for') ??
    request.headers.get('x-forwarded-for') ??
    request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim();
  return ip || null;
}

/**
 * Huella anónima del cliente para limitar el acaparamiento de retenciones.
 * Es un hash con secreto (no se guarda la IP en claro: RGPD).
 */
export function clientFingerprint(request: Request): string | null {
  const ip = clientIp(request);
  if (!ip) return null;
  const salt = env('ACCESS_LINK_SECRET') ?? 'samorai';
  return createHash('sha256').update(`${salt}:${ip}`).digest('base64url').slice(0, 32);
}

/** Solo rutas internas relativas (evita redirecciones abiertas). */
export function safeNextPath(next: string | null | undefined, fallback = '/cuenta'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}

/** Cabeceras para páginas con enlaces privados o datos personales. */
export const PRIVATE_PAGE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value: FormDataEntryValue | null): string | null {
  const email = String(value ?? '').trim();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

/** Texto libre acotado (sin caracteres de control). */
export function cleanText(value: FormDataEntryValue | null, max: number): string | null {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
  return text.length > 0 ? text : null;
}
