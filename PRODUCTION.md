# Puesta en producción — pagos, pedidos y correos

Checklist para pasar la tienda de **modo Test a modo Live**. El código ya está
listo; esto es configuración. Hazlo **en orden**: cada paso depende del anterior.

> Ninguna clave se guarda en el repositorio. `.env` está en `.gitignore` y las
> variables de producción viven en **Vercel → Settings → Environment Variables**.

---

## 0 · Antes de empezar

| Cuenta | Para qué | Quién la tiene |
|---|---|---|
| Stripe (Live) | Cobrar | Cliente |
| Resend | Correos de compra y contacto | Cliente / tú |
| Supabase "Samorai Wheels" | Guardar los pedidos | Cliente (ya creada) |
| Vercel | Hosting + variables de entorno | Ya conectado al repo |

La activación de la cuenta de Stripe en Live (datos fiscales, cuenta bancaria,
verificación de identidad) la tiene que completar **el titular del negocio**.
Sin eso no existen las claves `sk_live_…`.

---

## 1 · Stripe — producto y precios en modo Live ✅ HECHO

Creados el **4 de agosto de 2026** en la cuenta **Samorai**
(`acct_1TvO6rHZTdzugfFs`), modo **Live**:

| Objeto | ID |
|---|---|
| Producto `SAMORAI Victoria` | `prod_V0p92TPAUF6jr1` |
| Precio **275,00 €** (ancho 8.5) | `price_1U0nV8HZTdzugfFsRSwqa62i` |
| Precio **300,00 €** (anchos 9 y 9.5) | `price_1U0nVDHZTdzugfFsfL5iZkQH` |

Ambos: pago único, EUR, `tax_behavior: inclusive` (IVA incluido), producto
marcado como `shippable`.

Van a `STRIPE_PRICE_ID_LOW` (275) y `STRIPE_PRICE_ID_HIGH` (300) en Vercel.

> Los precios de Test (`price_1Tx1jS…` / `price_1Tx1jT…`) viven en el sandbox
> `acct_1TvO71HLDocwzNmf` y **no funcionan** en Live. Se quedan en tu `.env`
> local para seguir probando sin cobrar dinero real.

> Los precios son **finales con IVA incluido**: 275 € para el ancho 8.5 y 300 €
> para 9 y 9.5. El servidor recalcula siempre el importe desde el ancho de la
> referencia; el navegador nunca envía importes.

---

## 2 · Stripe — clave de API (restricted key)

Usa una **restricted key** (`rk_live_…`), nunca la secret key completa: una
`sk_live_…` filtrada puede mover dinero, hacer reembolsos y leer todos los
datos de clientes; esta solo puede abrir sesiones de pago.

La web hace **exactamente dos llamadas** a Stripe (`checkout.sessions.create`
al pagar y `checkout.sessions.retrieve` en la página de confirmación), así que
un único permiso basta:

1. Dashboard, **modo Live** (interruptor "Modo de prueba" apagado) →
   **Developers → API keys → Create restricted key**.
2. Nombre: `samorai-web-produccion`.
3. Busca **Checkout Sessions** y ponlo en **Write**.
   *Write incluye Read, así que la página `/success` también funciona.*
4. **Todo lo demás déjalo en None.** No hace falta PaymentIntents, ni
   Customers, ni Products, ni Refunds.
5. Crear → copiar la clave (**solo se muestra una vez**) → va a
   `STRIPE_SECRET_KEY` en Vercel.

Extra recomendable: en la propia clave, **Access policy → restringir por IP**
no es viable en Vercel (las IP de salida cambian), pero sí conviene revisar
periódicamente *Developers → API keys* y borrar claves que ya no uses.

> Si en algún momento se añaden reembolsos desde la web, habrá que ampliar
> permisos. Hoy los reembolsos se hacen desde el dashboard, que no usa esta clave.

---

## 3 · Stripe — webhook

Sin webhook **no se guarda ningún pedido y no sale ningún correo**, aunque el
cliente pague correctamente. Es el paso que más se olvida.

1. Dashboard, **modo Live** → **Developers → Webhooks → Add endpoint**.
2. **Endpoint URL** — cópiala **exactamente**, con `www`:

   ```
   https://www.samoraiwheels.com/api/stripe-webhook
   ```

   > ⚠️ **Sin el `www` no funciona nada.** El dominio sin `www` responde un
   > redirect **308** hacia el `www`, y **Stripe no sigue redirects** en las
   > entregas de webhook: todos los eventos fallarían. El resultado sería el
   > peor posible — el cliente paga bien, pero **no se guarda el pedido ni
   > sale ningún correo**, y nada avisa de ello.
   >
   > Comprobado el 4 ago 2026:
   > `samoraiwheels.com/api/stripe-webhook` → **308** (mal) ·
   > `www.samoraiwheels.com/api/stripe-webhook` → **400 Missing
   > stripe-signature header** (bien: el endpoint existe y valida la firma).
3. **Select events** → añade estos dos y ninguno más:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
4. Crear el endpoint → **Signing secret → Reveal** → copiar el `whsec_…` →
   va a `STRIPE_WEBHOOK_SECRET` en Vercel.
5. Con las variables ya puestas y el sitio redesplegado, pulsa
   **Send test event** (`checkout.session.completed`) y comprueba que responde
   **200**. Un evento de prueba no crea pedido (no lleva `metadata.cart`), pero
   confirma que la firma se valida bien.

> Ojo: el `whsec_…` que imprime `stripe listen` en local **es distinto** del
> endpoint de producción, y el de Test es distinto del de Live. Si te
> equivocas de secret, todos los eventos fallan con 400 y no llega ningún pedido.

---

## 4 · Resend — dominio verificado

En producción no puede usarse `onboarding@resend.dev`: solo envía a tu propia
dirección, así que **ningún cliente recibiría su confirmación**.

### 4.1 · Verificar el dominio

1. Resend → **Domains → Add Domain** → `samoraiwheels.com` → región
   **EU (Ireland)** (el negocio y los clientes están en la UE).
2. Resend muestra una lista de registros DNS. Añádelos **tal cual** en el panel
   donde esté el dominio (registrador o Vercel DNS):
   - **MX** + **TXT (SPF)** sobre el subdominio `send` → autoriza a Resend a
     enviar en tu nombre.
   - **TXT (DKIM)** en `resend._domainkey` → firma criptográfica de cada correo.
   - **TXT (DMARC)** en `_dmarc` → recomendado; empieza suave con
     `v=DMARC1; p=none;` para no bloquear correo legítimo mientras se ajusta.
3. Pulsa **Verify**. Suele tardar minutos; el DNS puede tardar hasta 48 h.
   No sigas hasta ver **Verified**.

Si el correo no se firma bien, Gmail y Outlook lo mandan a spam — por eso este
paso no es opcional.

### 4.2 · Clave de API

**API Keys → Create API Key**:
- Nombre: `samorai-web-produccion`
- Permission: **Sending access** (no *Full access*)
- Domain: `samoraiwheels.com`

→ `RESEND_API_KEY` en Vercel (se muestra una sola vez).

### 4.3 · Direcciones

| Variable | Valor | Qué es |
|---|---|---|
| `EMAIL_FROM` | `SAMORAI <pedidos@samoraiwheels.com>` | remitente de los correos |
| `SHOP_ORDER_EMAIL` | p. ej. `pedidos@samoraiwheels.com` | recibe el aviso de venta nueva |
| `CONTACT_EMAIL` | `isainzmorales@samoraiwheels.com` | recibe el formulario de contacto |

`SHOP_ORDER_EMAIL` y `CONTACT_EMAIL` admiten **varias direcciones separadas
por comas**, para que el aviso llegue a todo el equipo que gestiona pedidos:

```
SHOP_ORDER_EMAIL=pedidos@samoraiwheels.com, administracion@samoraiwheels.com
```

El buzón de `EMAIL_FROM` debe **existir y leerse**: los correos al cliente
invitan a responder, y las respuestas llegan ahí.

### 4.4 · Ver cómo quedan los correos

Con el servidor de desarrollo levantado (`npm run dev`):

- Confirmación al cliente → <http://localhost:5173/api/email-preview>
- Aviso de venta a la tienda → <http://localhost:5173/api/email-preview?to=shop>

Usan un pedido de ejemplo. En producción ese endpoint responde 404.

---

## 5 · Supabase — pedidos

El esquema (`orders` / `order_items`, ver `app/lib/orders/schema.sql`) ya está
aplicado en el proyecto **"Samorai Wheels"** con RLS activado.

- `SUPABASE_URL` — Project Settings → API → Project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — la clave **service_role**. Es secreta: salta RLS
  y **solo** se usa desde el servidor (webhook). Nunca en el navegador.

Sin Supabase el pago funciona igual, pero el pedido solo queda en los logs y
**se pierde la deduplicación**: si Stripe reintenta el webhook, el cliente
recibiría el correo de confirmación dos veces.

---

## 6 · Vercel — variables de entorno

Vercel → proyecto → **Settings → Environment Variables** → entorno
**Production**. Tras guardarlas hay que **volver a desplegar** (las variables se
leen al arrancar).

| Variable | Valor |
|---|---|
| `STRIPE_SECRET_KEY` | `rk_live_…` (paso 2) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` del endpoint (paso 3) |
| `STRIPE_PRICE_ID_LOW` | `price_…` de 275 € (paso 1) |
| `STRIPE_PRICE_ID_HIGH` | `price_…` de 300 € (paso 1) |
| `SITE_URL` | `https://www.samoraiwheels.com` (**con `www`**, sin barra final) |
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (secreta) |
| `RESEND_API_KEY` | clave de Resend |
| `EMAIL_FROM` | `SAMORAI <pedidos@samoraiwheels.com>` |
| `SHOP_ORDER_EMAIL` | destino del aviso de venta |
| `CONTACT_EMAIL` | destino del formulario de contacto |

**No definas** `STRIPE_FALLBACK_PRICE_CENTS` en producción (es solo para
pruebas: haría que una referencia sin precio se cobrase a un importe inventado).

### Plantilla para rellenar

Vercel permite pegar varias variables de golpe (**Import .env**). Rellena esto
en un bloc de notas y pégalo — y **bórralo después**, contiene secretos:

```
STRIPE_SECRET_KEY=rk_live_
STRIPE_WEBHOOK_SECRET=whsec_
STRIPE_PRICE_ID_LOW=price_
STRIPE_PRICE_ID_HIGH=price_
SITE_URL=https://www.samoraiwheels.com
SUPABASE_URL=https://yllcvbttbkceofvkicix.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=re_
EMAIL_FROM=SAMORAI <pedidos@samoraiwheels.com>
SHOP_ORDER_EMAIL=pedidos@samoraiwheels.com
CONTACT_EMAIL=isainzmorales@samoraiwheels.com
```

Marca el entorno **Production** (no Preview ni Development) y **vuelve a
desplegar** después: las variables se leen al arrancar el servidor.

Si falta algo, el servidor lo avisa al arrancar en los logs de Vercel:
`[config] revisar configuración de producción: …` (solo nombres, nunca valores).

---

## 7 · Prueba de fuego antes de abrir

1. Compra real con tarjeta propia por el importe más bajo (275 €).
2. Comprueba, en este orden:
   - [ ] Stripe → **Payments**: el pago aparece como *Succeeded*.
   - [ ] Stripe → **Webhooks**: el evento sale en verde (200). Si da rojo, abre
         el intento y mira la respuesta.
   - [ ] Supabase → tabla `orders` y `order_items`: una fila nueva con el
         importe y las líneas correctas.
   - [ ] Correo de confirmación al cliente (mira también spam).
   - [ ] Aviso de venta en `SHOP_ORDER_EMAIL`.
   - [ ] La página `/success` muestra importe y referencia.
3. **Reembolsa** el pago desde Stripe (Payments → Refund).
4. Prueba también el formulario de `/contacto` y confirma que llega.

---

## 8 · Pendientes conocidos (decisión de negocio, no bugs)

- **Envío gratuito.** El checkout declara "Envío gratuito" y el precio con IVA
  es el total. Si algún día se cobra envío, se añade en `shipping_options`
  (`app/routes/api.checkout.tsx`).
- **Países de envío.** Hoy: ES, PT, FR, DE, IT, NL, BE, AT, IE, LU, FI
  (`SHIPPING_COUNTRIES`, mismo archivo).
- **IVA.** `automatic_tax` está **desactivado** a propósito: los precios ya son
  finales con IVA incluido. Activar Stripe Tax solo tiene sentido si se vende
  fuera de España con tipos distintos, y requiere dar de alta el registro
  fiscal — sin registro activo, Stripe no recauda nada aunque parezca que sí.
- **Textos legales.** `/legal`, `/privacidad` y `/cookies` están pendientes de
  redacción legal. Vender al público sin condiciones de venta ni política de
  devoluciones es un problema legal, no técnico. Stripe además permite exigir
  aceptación de los términos en el checkout (Settings → Checkout → *Terms of
  service*), recomendable una vez existan.
- **Stock.** Sin control de inventario, **decisión aceptada** (2026-08-02): el
  stock es limitado pero no hay datos de existencias y no se espera un volumen
  alto de ventas. Se gestiona manualmente con el aviso de venta por correo. Si
  algún día se agota una referencia, lo rápido es desactivar su precio en
  Stripe o quitar la variante de `app/data/products.ts`.
