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

/**
 * ID real del `price` de Stripe para un nivel de precio.
 * Los `price_...` NO son secretos, pero viven en entorno para poder cambiar
 * entre Test y Live sin tocar el código. Si no está definido, el checkout
 * cae a `price_data` con el importe calculado en el servidor.
 *   · 'low'  → 275 € (ancho 8.5)
 *   · 'high' → 300 € (anchos 9 y 9.5)
 */
export function stripePriceId(tier: 'low' | 'high'): string | undefined {
  return env(tier === 'low' ? 'STRIPE_PRICE_ID_LOW' : 'STRIPE_PRICE_ID_HIGH');
}

/** `true` cuando corremos en el despliegue de producción (no preview ni local). */
export function isProduction(): boolean {
  return env('VERCEL_ENV') === 'production' || process.env.NODE_ENV === 'production';
}

/**
 * Variables imprescindibles para que el flujo de compra funcione de verdad:
 * cobrar (Stripe), confirmar el pago (webhook), guardar el pedido (Supabase)
 * y avisar por correo (Resend).
 */
const REQUIRED_IN_PRODUCTION = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_ID_LOW',
  'STRIPE_PRICE_ID_HIGH',
  'SITE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'SHOP_ORDER_EMAIL',
] as const;

/**
 * Revisa la configuración y devuelve los problemas encontrados, sin exponer
 * NUNCA el valor de ninguna variable (solo nombres y diagnóstico).
 */
export function configProblems(): string[] {
  const problems: string[] = [];

  for (const name of REQUIRED_IN_PRODUCTION) {
    if (!env(name)) problems.push(`falta ${name}`);
  }

  const key = env('STRIPE_SECRET_KEY');
  if (key && isProduction() && /^(sk|rk)_test_/.test(key)) {
    problems.push('STRIPE_SECRET_KEY es de TEST en un entorno de producción (no se cobra dinero real)');
  }

  const whsec = env('STRIPE_WEBHOOK_SECRET');
  if (whsec && !whsec.startsWith('whsec_')) {
    problems.push('STRIPE_WEBHOOK_SECRET no tiene el formato whsec_… (¿copiaste el signing secret?)');
  }

  const site = env('SITE_URL');
  if (site && isProduction() && !site.startsWith('https://')) {
    problems.push('SITE_URL debe ser https:// en producción');
  }

  if (env('STRIPE_FALLBACK_PRICE_CENTS') && isProduction()) {
    problems.push('STRIPE_FALLBACK_PRICE_CENTS está definido en producción (debe estar vacío)');
  }

  return problems;
}

// Aviso en arranque: si falta algo en producción, queda en los logs del
// despliegue. No detiene el servidor (la web informativa debe seguir en pie
// aunque la tienda no esté configurada) ni imprime valores.
if (isProduction()) {
  const problems = configProblems();
  if (problems.length > 0) {
    console.warn(`[config] revisar configuración de producción:\n  · ${problems.join('\n  · ')}`);
  }
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
