# Stripe — guía de configuración

Todo el **código** del checkout está listo. Esto es lo que queda por hacer
**manualmente** (claves, precios, webhook). Pasos en orden.

## 1. Claves de API

1. Entra en tu cuenta de Stripe en **modo Test** → **Developers → API keys**.
2. El archivo `.env` ya existe (creado con los Price IDs). Rellena en él:
   - `STRIPE_SECRET_KEY` — recomendado una **restricted key** `rk_test_…`
     (Developers → API keys → *Create restricted key*) con permiso
     **Checkout Sessions: Write**. Más segura que la `sk_test_…`.
   - `SITE_URL` ya está en `http://localhost:5173`.

`.env` está en `.gitignore` — nunca se sube al repositorio.

## 2. Precios de producto — YA CREADOS (Test)

Los dos niveles de precio ya existen en Stripe (modo Test, IVA incluido /
`tax_behavior: inclusive`) y están cableados en `.env`:

| Nivel | Importe | Ancho | Price ID (Test) |
|---|---|---|---|
| LOW  | 275,00 € | 8.5 | `price_1Tx1jSHLDocwzNmf9D52ckeN` |
| HIGH | 300,00 € | 9 / 9.5 | `price_1Tx1jTHLDocwzNmfXIt3hGnk` |

Producto: `prod_UwvaYZqE7GvQD7` (SAMORAI Victoria).

El checkout usa el **Price ID real** cuando está en `.env`
(`STRIPE_PRICE_ID_LOW/HIGH`); si faltara, cae a `price_data` con el importe
calculado en el servidor. En ambos casos el navegador **nunca** envía importes.

Para **producción** hay que crear los precios en modo **Live** y poner sus IDs
en el entorno de producción (Vercel), ya que Test y Live tienen IDs distintos.

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
