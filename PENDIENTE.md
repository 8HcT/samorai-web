# Qué falta para lanzar — lista de lo que tienes que aportar

Estado a **4 de agosto de 2026**. El **código está terminado**; esto es lo que
depende de ti o del cliente. Ordenado por lo que bloquea de verdad.

Tu `.env` local está **completo y funcionando en modo Test**. Lo que falta es
todo lo de **modo Live** (claves distintas) más los textos legales.

Detalle técnico paso a paso de cada punto: **`PRODUCTION.md`**.

---

## A · Sin esto no se puede cobrar

| # | Qué | Quién | Resultado |
|---|---|---|---|
| ~~A1~~ | ~~**Activar la cuenta de Stripe en Live**~~ — **confirmado activo** (4 ago 2026) | — | ✅ |
| ~~A2~~ | ~~**Crear los 2 precios en Live**~~ — **HECHO** (4 ago 2026), IDs abajo | — | ✅ |
| A3 | **Restricted key** `rk_live_…` con permiso *Checkout Sessions: Write* | Tú (nunca me la pases) | `STRIPE_SECRET_KEY` |
| A4 | **Webhook** a `https://www.samoraiwheels.com/api/stripe-webhook` con los 2 eventos | Tú | `STRIPE_WEBHOOK_SECRET` |
| ~~A5~~ | ~~**Dominio**~~ — `samoraiwheels.com` ya sirve desde Vercel (4 ago 2026) | — | ✅ |

### ⚠️ El `www` no es opcional

`samoraiwheels.com` responde un **redirect 308** hacia `www.samoraiwheels.com`,
y **Stripe no sigue redirects** en los webhooks. Si registras el endpoint sin
`www`, **todas las entregas fallan**: el cliente paga bien, pero no se guarda
el pedido ni sale ningún correo, y nada te avisa.

Por eso, con `www` en los dos sitios:

- Webhook → `https://www.samoraiwheels.com/api/stripe-webhook`
- `SITE_URL` → `https://www.samoraiwheels.com`

Comprobado el 4 ago 2026: el endpoint responde **400 Missing stripe-signature
header** en `www` (correcto: existe y valida la firma) y **308** sin `www`.

---

## B · Sin esto no se puede vender legalmente en España

Los textos de `/legal`, `/privacidad` y `/cookies` son **plantillas con huecos**
y muestran un aviso de "pendiente de redacción legal" en la propia web. Vender
al público sin esto es un problema legal, no técnico.

**Datos que hacen falta** (los pide la LSSI, van en el aviso legal):

- Razón social y **NIF/CIF**
- Domicilio fiscal
- Email y teléfono de contacto
- Datos registrales (Registro Mercantil, tomo/folio/hoja) si es sociedad

**Textos que tiene que redactar o validar un abogado:**

- **Condiciones de venta**: plazo de entrega, gastos de envío, forma de pago,
  qué pasa si algo llega dañado
- **Derecho de desistimiento** (14 días naturales) y **formulario** de
  devolución — obligatorio en venta a distancia
- **Garantía legal** de 3 años (Ley 4/2022)
- **Política de privacidad (RGPD)**: responsable, finalidad, base legal,
  derechos, y los **encargados de tratamiento** que ya usa la web:
  **Stripe** (pagos), **Resend** (correos), **Supabase** (pedidos),
  **Vercel** (hosting)
- **Política de cookies**

Cuando tengas los textos me los pasas y los maqueto en las tres páginas.

**Recomendable además:** en Stripe → *Settings → Checkout* → activar
*Terms of service*, para que el cliente acepte las condiciones al pagar.

---

## C0 · ⚠️ El correo de `@samoraiwheels.com` está ROTO

**Detectado el 10 ago 2026.** El dominio **no tiene registros MX, ni SPF, ni
DKIM**. Google Workspace conserva los buzones (`sales@`, `isainzmorales@`),
pero ningún servidor sabe dónde entregar el correo: **todo lo que te escriban
rebota**.

Causa: al apuntar el dominio a **Vercel DNS** (`ns1.vercel-dns.com`), los
registros de correo se quedaron en el proveedor de DNS anterior y no se
copiaron. Por eso antes llegaban los pedidos y ahora no.

Consecuencias actuales:
- Los clientes que escriben a `sales@samoraiwheels.com` reciben un rebote.
- Stripe manda avisos de **fraude y disputas** al email de la cuenta
  (`isainzmorales@samoraiwheels.com`), que rebota. Las disputas tienen plazo:
  no enterarse significa perderlas.
- Bloqueó temporalmente la creación de la restricted key (A3).

**Arreglo** — Vercel → Domains → samoraiwheels.com → DNS Records:

| Tipo | Nombre | Valor |
|---|---|---|
| MX | *(vacío o `@`)* | `smtp.google.com`, prioridad `1` |
| TXT | *(vacío o `@`)* | `v=spf1 include:_spf.google.com ~all` |
| TXT | `google._domainkey` | el DKIM que genera el panel de Workspace |

Los valores exactos están en *Admin de Workspace → Aplicaciones → Google
Workspace → Gmail → Autenticar correo*. No interfiere con Resend: aquello vive
en el subdominio `send.samoraiwheels.com`.

---

## C · Correos salientes (para que lleguen y no caigan en spam)

Ahora mismo el remitente es `onboarding@resend.dev`, que **solo puede enviar a
tu propia dirección**: en producción ningún cliente recibiría su confirmación.

| # | Qué | Resultado |
|---|---|---|
| C1 | Verificar `samoraiwheels.com` en Resend (registros DNS: SPF, DKIM, DMARC) | El dominio en **Verified** |
| C2 | Crear API key de Resend con permiso *Sending access* | `RESEND_API_KEY` |
| C3 | Que **exista y se lea** el buzón `pedidos@samoraiwheels.com` | `EMAIL_FROM` |
| C4 | Decidir quién recibe los avisos de venta (admite varias, separadas por comas) | `SHOP_ORDER_EMAIL` |

---

## D · Decisiones de negocio que faltan en la web

No bloquean el cobro, pero el cliente las pregunta y hoy no hay respuesta:

- **Plazo de entrega** ("en X días laborables") — debería salir en la ficha y en
  el correo de confirmación
- **Países de envío**: hoy ES, PT, FR, DE, IT, NL, BE, AT, IE, LU, FI.
  ¿Se queda así? ¿Baleares/Canarias tienen condiciones distintas?
- **Devoluciones**: quién paga el porte de vuelta
- **Envío gratuito**: confirmado, ya está declarado en el checkout
- **Stock**: sin control, gestión manual por el aviso de venta — **decidido**

---

## E · Variables para Vercel

Vercel → proyecto → **Settings → Environment Variables** → entorno
**Production** → *Import .env*. Pega esto relleno y **borra el borrador
después** (contiene secretos):

```
STRIPE_SECRET_KEY=rk_live_...............................
STRIPE_WEBHOOK_SECRET=whsec_.............................
STRIPE_PRICE_ID_LOW=price_1U0nV8HZTdzugfFsRSwqa62i
STRIPE_PRICE_ID_HIGH=price_1U0nVDHZTdzugfFsfL5iZkQH
SITE_URL=https://www.samoraiwheels.com
SUPABASE_URL=https://yllcvbttbkceofvkicix.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_.....................
RESEND_API_KEY=re_.......................................
EMAIL_FROM=SAMORAI <pedidos@samoraiwheels.com>
SHOP_ORDER_EMAIL=pedidos@samoraiwheels.com
CONTACT_EMAIL=isainzmorales@samoraiwheels.com
```

De dónde sale cada una:

| Variable | De dónde | Ojo |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Live → API keys → Create restricted key | Debe empezar por **`rk_live_`**. Si pone `test`, **no cobras dinero real** |
| `STRIPE_WEBHOOK_SECRET` | Stripe Live → Webhooks → tu endpoint → Signing secret | **No** es el de `stripe listen` ni el de Test |
| `STRIPE_PRICE_ID_LOW` | **Ya creado** (275 €) | Copiar tal cual del bloque de arriba |
| `STRIPE_PRICE_ID_HIGH` | **Ya creado** (300 €) | Idem |
| `SITE_URL` | Tu dominio | **Con `www`**, `https://` y sin barra final |
| `SUPABASE_URL` | Ya lo tienes (mismo en test y producción) | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | Secreta: salta RLS. Solo servidor |
| `RESEND_API_KEY` | Resend → API Keys | Permiso *Sending access*, no *Full access* |
| `EMAIL_FROM` | Buzón del dominio verificado | **No** `onboarding@resend.dev` |
| `SHOP_ORDER_EMAIL` | Decisión tuya | Admite varias separadas por comas |
| `CONTACT_EMAIL` | Decisión tuya | Admite varias separadas por comas |

**No pongas** `STRIPE_FALLBACK_PRICE_CENTS` en producción: haría que una
referencia sin precio se cobrase a un importe inventado.

**Tras guardar las variables hay que volver a desplegar** — se leen al arrancar.
Si falta alguna, el arranque lo avisa en los logs de Vercel:
`[config] revisar configuración de producción: …`

---

## F · Prueba final antes de abrir

1. Compra real con tu tarjeta por 275 €.
2. Comprueba: pago en Stripe · webhook en **200** · fila en Supabase ·
   correo al cliente · aviso de venta · página `/success`.
3. **Reembolsa** desde Stripe.
4. Prueba el formulario de `/contacto`.

---

## Resumen: lo que necesito de ti

1. **Conectar el MCP de Stripe a la cuenta Live** → creo los precios (A2).
2. Pasarme, cuando los tengas, **los textos legales** (B) → los maqueto.
3. Decirme el **plazo de entrega y la política de devoluciones** (D) → los
   añado a la ficha y a los correos.

Las claves (A3, A4, C2) y los DNS (C1) **hazlos tú**: no debo manejar secretos
ni acceder a los paneles de las cuentas.
