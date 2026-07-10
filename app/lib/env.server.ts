/**
 * Acceso a variables de entorno del SERVIDOR (nunca llega al cliente:
 * este archivo es `.server.ts`).
 *
 * En desarrollo cargamos `.env` con dotenv. En producción
 * (@react-router/serve / Docker) las variables vienen del entorno real;
 * dotenv no las sobrescribe, así que el entorno real tiene prioridad.
 */
import 'dotenv/config';

/** Devuelve la variable o `undefined` si no está definida / vacía. */
export function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/** Devuelve la variable o lanza un error claro si falta. */
export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Defínela en .env (ver .env.example).`
    );
  }
  return value;
}

/** Precio de prueba (céntimos) para variantes sin precio configurado. */
export function fallbackPriceCents(): number | null {
  const raw = env('STRIPE_FALLBACK_PRICE_CENTS');
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** URL base del sitio para construir las return URLs de Stripe. */
export function siteUrl(): string {
  // 1) SITE_URL explícita (recomendado en producción con dominio propio).
  const explicit = env('SITE_URL');
  if (explicit) return explicit.replace(/\/$/, '');
  // 2) En Vercel, VERCEL_URL trae el host del deployment (sin protocolo).
  const vercel = env('VERCEL_URL');
  if (vercel) return `https://${vercel}`;
  // 3) Desarrollo local.
  return 'http://localhost:5173';
}
