/**
 * Configuración de la preventa (solo servidor).
 *
 * Los interruptores de seguridad se activan EXPLÍCITAMENTE por entorno: sin
 * ellos el sistema funciona en pruebas pero no cobra dinero real ni lanza
 * envíos masivos (requisito del cliente: validación expresa).
 */
import { env } from '~/lib/env.server';

/**
 * Duración de la sesión de Stripe Checkout. Stripe exige un mínimo de 30
 * minutos; se usa 31 para que el reloj no la deje por debajo del mínimo.
 */
/**
 * Interruptor general de la preventa (función futura). Sin
 * `PRESALE_ENABLED=true` la tienda funciona solo con el carrito: las fichas
 * ignoran las tiradas, y las páginas de reserva/cuenta y las secciones de
 * preventa del admin devuelven 404. El login (también del admin) sigue activo.
 */
export function presaleEnabled(): boolean {
  return env('PRESALE_ENABLED') === 'true';
}

/** Para loaders/actions exclusivos de la preventa. */
export function assertPresaleEnabled(): void {
  if (!presaleEnabled()) throw new Response('Not Found', { status: 404 });
}

export const CHECKOUT_SESSION_MINUTES = 31;

/**
 * Margen de la retención sobre la sesión de Stripe: cubre webhooks que
 * llegan con algo de retraso. Pasado este tiempo la plaza vuelve a estar
 * libre automáticamente (la base de datos deja de contarla).
 */
export const HOLD_GRACE_MINUTES = 15;
export const HOLD_MINUTES = CHECKOUT_SESSION_MINUTES + HOLD_GRACE_MINUTES;

/**
 * Envíos automáticos o masivos (anuncio de lanzamiento, recordatorios,
 * caducidades, cancelación de tirada). Sin `PRESALE_BULK_EMAILS_ENABLED=true`
 * quedan RETENIDOS en la cola (visibles en /admin/correos).
 */
export function presaleBulkEmailsEnabled(): boolean {
  return env('PRESALE_BULK_EMAILS_ENABLED') === 'true';
}

/** `true` si la clave de Stripe configurada es de modo Live. */
export function isStripeLiveKey(): boolean {
  return /^(sk|rk)_live_/.test(env('STRIPE_SECRET_KEY') ?? '');
}

/**
 * Cobros reales de preventa/venta directa. Con una clave Live hace falta
 * además `PRESALE_LIVE_PAYMENTS_ENABLED=true`. Con claves de test, siempre.
 */
export function presalePaymentsAllowed(): boolean {
  if (!isStripeLiveKey()) return true;
  return env('PRESALE_LIVE_PAYMENTS_ENABLED') === 'true';
}

/** Secreto HMAC de los enlaces seguros (≥ 32 caracteres). */
export function accessLinkSecret(): string {
  const secret = env('ACCESS_LINK_SECRET');
  if (!secret || secret.length < 32) {
    throw new Error('Falta ACCESS_LINK_SECRET (mínimo 32 caracteres aleatorios). Ver .env.example.');
  }
  return secret;
}

export function isAccessLinkSecretConfigured(): boolean {
  return (env('ACCESS_LINK_SECRET') ?? '').length >= 32;
}

/** Secreto que deben presentar las tareas programadas (Bearer). */
export function cronSecret(): string | undefined {
  const secret = env('CRON_SECRET');
  return secret && secret.length >= 16 ? secret : undefined;
}
