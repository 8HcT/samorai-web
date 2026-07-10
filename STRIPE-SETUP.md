# Stripe — guía de configuración

Todo el **código** del checkout está listo. Esto es lo que queda por hacer
**manualmente** (claves, precios, webhook). Pasos en orden.

## 1. Claves de API

1. Crea/entra en tu cuenta de Stripe → **Developers → API keys** (modo **Test**).
2. Copia `.env.example` a `.env` y rellena:
   - `STRIPE_SECRET_KEY` = `sk_test_…`
   - `SITE_URL` = `http://localhost:5173` (en producción, tu dominio https)

`.env` está en `.gitignore` — nunca se sube al repositorio.

## 2. Precios de producto

Los precios viven en `app/data/products.ts`, campo **`priceCents`** por variante
(céntimos de EUR; ej. `45000` = 450,00 €). Hoy están sin definir.

- **Producción:** pon el `priceCents` real en cada variante vendible.
- **Pruebas rápidas:** define `STRIPE_FALLBACK_PRICE_CENTS=45000` en `.env` y todas
  las variantes sin precio usarán ese importe (solo para probar el flujo).

El checkout **calcula los precios en el servidor** desde estos datos; el navegador
nunca envía importes.

## 3. Webhook (confirmación de pago + pedidos)

El endpoint ya existe en **`POST /api/stripe-webhook`** (verifica la firma).

### Local
```bash
# instala Stripe CLI una vez: https://stripe.com/docs/stripe-cli
stripe login
stripe listen --forward-to localhost:5173/api/stripe-webhook
```
Copia el `whsec_…` que imprime a `STRIPE_WEBHOOK_SECRET` en `.env`.

### Producción
Dashboard → **Developers → Webhooks → Add endpoint**:
- URL: `https://tudominio.com/api/stripe-webhook`
- Evento: `checkout.session.completed`
- Copia el **Signing secret** (`whsec_…`) a `STRIPE_WEBHOOK_SECRET` del entorno.

## 4. Probar el flujo

1. `npm run dev` (con `.env` relleno y `stripe listen` activo).
2. Añade una rueda al carrito → **Cart → Proceed to Checkout**.
3. Tarjeta de prueba: `4242 4242 4242 4242`, fecha futura, CVC cualquiera.
4. Tras pagar vuelves a `/success`; el carrito se vacía y el webhook registra el
   pedido (mira la consola del servidor: `[stripe][order] …`).

## 5. (Opcional) Guardar pedidos en Supabase

Hoy el pedido se registra por consola en `app/lib/orders/orders.server.ts`.
Para persistir:
1. `npm install @supabase/supabase-js`
2. Aplica `app/lib/orders/schema.sql` en tu proyecto Supabase.
3. Define `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env`.
4. Descomenta la inserción marcada con `TODO` en `orders.server.ts`.

## 6. (Opcional) Impuestos y envío

- **Envío:** países permitidos en `app/routes/api.checkout.tsx` (`SHIPPING_COUNTRIES`).
- **IVA:** activa **Stripe Tax** en el dashboard y pon `automatic_tax: { enabled: true }`
  en la creación de la sesión (`api.checkout.tsx`).

---

### Mapa de archivos
| Archivo | Rol |
|---|---|
| `.env.example` | Plantilla de variables (copiar a `.env`) |
| `app/lib/env.server.ts` | Carga `.env` (dotenv) + getters de entorno |
| `app/lib/stripe/stripe.server.ts` | Cliente Stripe perezoso (solo servidor) |
| `app/lib/money.ts` | `CURRENCY` + `formatPrice` (céntimos → €) |
| `app/lib/cart/` | Carrito (estado + context + localStorage) |
| `app/lib/orders/` | Persistencia de pedidos + `schema.sql` |
| `app/routes/api.checkout.tsx` | Crea la sesión de Checkout y redirige a Stripe |
| `app/routes/api.stripe-webhook.tsx` | Verifica firma + procesa el pago |
| `app/routes/cart.tsx` · `success.tsx` · `cancel.tsx` | UI de carrito y retornos |
