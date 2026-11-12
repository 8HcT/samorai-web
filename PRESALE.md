# Preventa, tiradas, reservas y stock — puesta en marcha

Sistema de preventa por tiradas de fabricación: reserva de 50 € por juego,
descuento de preventa configurable, lanzamiento oficial con pago restante,
caducidad automática a los 30 días, venta directa, cuentas opcionales y panel
de administración (`/admin`).

## 1 · Migraciones

**Con la CLI (recomendado, desde 2026-11-12):** una vez por equipo,
`npx supabase login` y `npx supabase link --project-ref yllcvbttbkceofvkicix`.
Después, para aplicar las migraciones pendientes:
`npx supabase db push --dry-run` (revisar) y `npx supabase db push`. La CLI
lleva el registro de lo aplicado en `supabase_migrations.schema_migrations`.

**A mano (Supabase → SQL Editor, en orden):**

```
supabase/migrations/20260725000000_orders_baseline.sql        (idempotente: ya aplicado)
supabase/migrations/20261020100000_profiles.sql
supabase/migrations/20261020100100_production_batches.sql
supabase/migrations/20261020100200_reservations_inventory_payments.sql
supabase/migrations/20261020100300_notifications_audit_events.sql
supabase/migrations/20261020100400_presale_functions.sql
supabase/migrations/20261020100500_rls_policies.sql
supabase/migrations/20261020100600_presale_cron.sql           (tras activar pg_cron y pg_net)
```

Mientras no se apliquen, la web sigue funcionando como antes (carrito sin tiradas).

**Tareas programadas (Supabase):** Database → Extensions → activar `pg_cron` y
`pg_net`. Después, en el SQL Editor:

```sql
select vault.create_secret('https://www.samoraiwheels.com/api/cron/presale', 'presale_cron_url');
select vault.create_secret('<mismo valor que CRON_SECRET>', 'presale_cron_secret');
```

y vuelve a ejecutar `20261020100600_presale_cron.sql`. Programa dos tareas cada
5 minutos: mantenimiento en SQL (caducidades, liberación de stock, recordatorios)
y envío de correos (llama al endpoint con el secreto).

**Primer administrador** (después de que entre una vez en `/cuenta/acceso`):

```sql
update public.profiles set role = 'admin' where email = 'admin@tudominio.com';
```

## 2 · Variables de entorno (Vercel y `.env`)

| Variable | Para qué |
|---|---|
| `SUPABASE_ANON_KEY` | Clave pública de Supabase (Auth de «Mi cuenta»). |
| `ACCESS_LINK_SECRET` | ≥ 32 caracteres aleatorios. Firma los enlaces de reserva/pedido sin login. Cambiarlo invalida todos. |
| `CRON_SECRET` | Secreto Bearer de `/api/cron/presale` (el mismo que en Vault). |
| `PRESALE_BULK_EMAILS_ENABLED` | `true` para permitir correos automáticos/masivos (lanzamiento, recordatorios, caducidad). Sin él quedan **retenidos**. |
| `PRESALE_LIVE_PAYMENTS_ENABLED` | `true` para cobrar de verdad con clave Live. Sin él, con clave Live, preventa y venta directa **no cobran**. |

Las de siempre (`STRIPE_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`RESEND_API_KEY`, `EMAIL_FROM`, `SHOP_ORDER_EMAIL`, `SITE_URL`) siguen igual.

## 3 · Stripe

- Webhook `https://www.samoraiwheels.com/api/stripe-webhook` con estos eventos:
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.
- Clave restringida: **Checkout Sessions: Write** + **Refunds: Write** (devoluciones desde el panel).
- La señal y el pago final usan `price_data` (importe del servidor). No hace falta crear productos.

## 4 · Supabase Auth

- Authentication → URL Configuration: **Site URL** = `https://www.samoraiwheels.com` y
  añade `https://www.samoraiwheels.com/auth/confirm` a *Redirect URLs*.
- Mantén **Confirm email** activado.
- SMTP propio (Resend) en Authentication → SMTP: el SMTP de Supabase solo envía unos pocos correos por hora.
- Plantillas (para que los enlaces funcionen en cualquier dispositivo):
  - Magic link y Confirm signup:
    `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`
  - Reset password: `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`

## 5 · Uso (panel `/admin`)

1. **Tiradas → Nueva tirada**: nombre, capacidad, fechas, reserva, descuento y los
   cuatro textos de condiciones (los redacta o valida el negocio).
2. **Abrir preventa.** No se abre sin las condiciones.
3. **Lanzar**: fija la fecha efectiva, abre el plazo de pago (fecha límite en UTC)
   y habilita la venta directa.
4. Hitos: En producción → Disponible → Finalizada. También se puede cancelar la
   tirada: las señales quedan marcadas para devolver y el reembolso se hace
   reserva a reserva.

La reserva abonada **nunca se pierde automáticamente**. La política por defecto
es la decisión manual. Retenerla solo es posible si las condiciones aceptadas
estaban validadas legalmente.

## 6 · Pruebas

```
npm test          # 107 tests: PostgreSQL 17 real (embedded-postgres), concurrencia,
                  # caducidad, webhooks, correos, checkout, RLS
npm run typecheck
npm run build
```

Para probarlo todo con Stripe en modo test: aplica las migraciones en un proyecto
Supabase de pruebas, configura `.env`, ejecuta
`stripe listen --forward-to localhost:5173/api/stripe-webhook` y paga con
`4242 4242 4242 4242`. Las plantillas de correo se previsualizan en desarrollo en
`/api/email-preview?template=list`.

## 7 · Pendiente de decisión del negocio

- Textos legales de reserva, cancelación, devolución y caducidad (por tirada).
- Capacidad, fechas y nombre reales de la primera tirada.
- Juegos con medidas distintas delante y detrás (*staggered*): no incluidos.
- Captcha (p. ej. Turnstile) en la reserva si aparece abuso. Ya hay límites por email e IP y un honeypot.
