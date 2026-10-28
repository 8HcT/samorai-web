import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Tests (separados de vite.config.ts para no cargar el plugin de React
 * Router). Los tests de base de datos arrancan un PostgreSQL 17 real
 * (embedded-postgres) en `tests/setup/global-db.ts`, aplican las migraciones
 * de supabase/migrations y clonan una base de datos limpia por archivo.
 */
export default defineConfig({
  resolve: {
    alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/setup/global-db.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Los tests NUNCA deben tocar servicios reales: se neutraliza el .env
    // local (dotenv no sobrescribe variables ya definidas) y se usan claves
    // ficticias. La base de datos es la PostgreSQL embebida.
    env: {
      DOTENV_CONFIG_PATH: 'tests/.env.does-not-exist',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      SUPABASE_ANON_KEY: '',
      STRIPE_SECRET_KEY: 'sk_test_dummy_for_tests',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_secret_for_tests',
      RESEND_API_KEY: '',
      EMAIL_FROM: 'SAMORAI <test@example.com>',
      SHOP_ORDER_EMAIL: 'shop@example.com',
      SITE_URL: 'https://shop.example.com',
      ACCESS_LINK_SECRET: 'test-access-link-secret-0123456789abcdef',
      CRON_SECRET: 'test-cron-secret-0123456789',
      PRESALE_BULK_EMAILS_ENABLED: '',
      PRESALE_LIVE_PAYMENTS_ENABLED: '',
    },
  },
});
