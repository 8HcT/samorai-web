# Qué falta para lanzar — lista de lo que tienes que aportar

Estado a **4 de agosto de 2026**. El **código está terminado**; esto es lo que
depende de ti o del cliente. Ordenado por lo que bloquea de verdad.

Tu `.env` local está **completo y funcionando en modo Test**. Lo que falta es
todo lo de **modo Live** (claves distintas) más los textos legales.

Detalle técnico paso a paso de cada punto: **`PRODUCTION.md`**.

> **Revisado 2026-11-12.** Comprobado desde fuera: analítica (GA4 + GTM) en
> producción, webhook respondiendo en `www`, correo del dominio con MX/SPF/DMARC
> y registros de Resend en DNS. Sigue pendiente: DKIM de Google, textos legales
> y desplegar SEO + panel de precios (sección **R**).
>
> **Actualizado 2026-10-20 · sistema de preventa.** Ya está programado el
> sistema de tiradas, reservas de 50 €, stock real, cuentas de cliente y panel
> `/admin`. Lo que hay que aportar para activarlo está en la sección **P** de
> abajo; el detalle técnico, en **`PRESALE.md`**.

---

## A · Sin esto no se puede cobrar

| # | Qué | Quién | Resultado |
|---|---|---|---|
| ~~A1~~ | ~~**Activar la cuenta de Stripe en Live**~~ — **confirmado activo** (4 ago 2026) | — | ✅ |
| ~~A2~~ | ~~**Crear los 2 precios en Live**~~ — **HECHO** (4 ago 2026), IDs abajo | — | ✅ |
| A3 | **Restricted key** `rk_live_…` con permisos *Checkout Sessions: Write* y *Refunds: Write* | Tú (nunca me la pases) | `STRIPE_SECRET_KEY` |
| A4 | **Webhook** a `https://www.samoraiwheels.com/api/stripe-webhook` con los 5 eventos (lista en `PRODUCTION.md` §3) | Tú | `STRIPE_WEBHOOK_SECRET` |
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

> **12 nov 2026: casi resuelto.** Ya hay MX (`smtp.google.com`), SPF y DMARC
> (`p=none`). **Falta solo el DKIM de Google** (`google._domainkey`): Admin de
> Workspace → Gmail → Autenticar correo → generar → TXT en Vercel DNS → «Iniciar
> autenticación».

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
| C1 | Verificar `samoraiwheels.com` en Resend (registros DNS: SPF, DKIM, DMARC). *12 nov: los registros ya están en DNS; confirmar que Resend lo marca Verified* | El dominio en **Verified** |
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
- **Stock**: ~~sin control~~ → *2026-10-20:* lo controla el sistema de preventa
  por tiradas (ver sección **P**)

---

## P · Preventa y tiradas (activar el sistema nuevo)

Guía técnica completa: **`PRESALE.md`**. En resumen:

| # | Qué | Quién |
|---|---|---|
| P1 | Aplicar las migraciones de `supabase/migrations/` en el proyecto "Samorai Wheels" (SQL Editor, en orden) | Tú |
| P2 | Activar `pg_cron` y `pg_net` (Database → Extensions) y guardar en Vault la URL y el secreto del cron | Tú |
| P3 | Variables nuevas en Vercel: `SUPABASE_ANON_KEY`, `ACCESS_LINK_SECRET`, `CRON_SECRET` | Tú |
| P4 | Supabase Auth: URL de redirección `/auth/confirm`, SMTP propio (Resend) y plantillas de email | Tú |
| P5 | Nombrar al primer administrador (una línea de SQL en `PRESALE.md`) | Tú |
| P6 | **Textos legales de la preventa**: condiciones de reserva, cancelación, devolución y caducidad de la señal | Cliente + abogado |
| P7 | Datos de la primera tirada: nombre, capacidad en juegos, fechas, entrega estimada | Cliente |
| P8 | **Validación expresa** para activar `PRESALE_LIVE_PAYMENTS_ENABLED` (cobros reales) y `PRESALE_BULK_EMAILS_ENABLED` (correos automáticos) | Cliente |

Mientras no se haga P1 la web sigue exactamente como ahora (carrito sin tiradas).
Además, la preventa queda **apagada** hasta poner `PRESALE_ENABLED=true` en Vercel (función futura).

---

## R · Precios y promociones desde `/admin/precios` (para Black Friday)

> **14-11-2026: R1–R6 hechos** (migraciones aplicadas y verificadas, Auth
> configurado, admin creado, variables en Vercel, desplegado). Queda **R7**.

Con la preventa **apagada** basta con esto (no hace falta P2, `ACCESS_LINK_SECRET`
ni `CRON_SECRET`):

| # | Qué | Dónde |
|---|---|---|
| R1 | Comprobar que **no** existen aún las tablas `profiles` / `production_batches` (si existen, avisar antes de seguir) | Supabase → Table Editor |
| R2 | Ejecutar en orden: `20260725000000_orders_baseline` → `…100000_profiles` → `…100100` → `…100200` → `…100300` → `…100400` → `…100500` → `20261106100000_pricing_promotions`. **Saltar** `…100600_presale_cron` (solo preventa) | Supabase → SQL Editor |
| R3 | Site URL `https://www.samoraiwheels.com` y Redirect URL `https://www.samoraiwheels.com/auth/confirm` | Supabase → Authentication → URL Configuration |
| R4 | Crear el usuario admin con **contraseña** y *Auto Confirm User*; después `update public.profiles set role = 'admin' where email = '…';` | Supabase → Authentication → Users + SQL Editor |
| R5 | `SUPABASE_ANON_KEY` (clave *anon* / *publishable*) en Vercel → Production | Supabase → Project Settings → API Keys |
| R6 | Desplegar (push a `1.0`) y entrar en `/cuenta/acceso` con la contraseña → lleva a `/admin` | — |
| R7 | Crear la promoción con las fechas reales (queda «Programada» y se activa sola) | `/admin/precios` |

- El precio se calcula en el servidor y Stripe cobra el importe con descuento. En el checkout y en el recibo aparece la línea con «Black Friday −20%» y el precio anterior.
- Ya **no** se usan `STRIPE_PRICE_ID_LOW/HIGH` y se quitaron de Vercel el 14-11. Tampoco hacen falta para un *Instant Rollback*: la versión anterior, sin ellos, cobra con el importe del servidor.
- Si la base de datos no responde: las páginas muestran el precio por defecto sin promoción, y el checkout **no cobra** (aviso de error en el carrito).
- **Precio anterior tachado:** en España debe ser el precio más bajo aplicado en los 30 días anteriores. No subas precios antes de la promoción.
- La preventa (desactivada) sigue usando sus propios precios; no le afectan estas promociones.

---

## T · Panel `/admin` y compra de prueba (14 nov 2026)

Qué hay en el panel (todo con la preventa apagada):

- **Panel**: pedidos de hoy / 7 / 30 días, ingresos netos (cobrado − devuelto),
  llantas vendidas, ticket medio, pendientes de enviar, últimos pedidos, ventas
  por referencia y por acabado, precio vigente de cada una de las 10 referencias
  y un resumen del estado del sistema.
- **Pedidos**: qué llantas lleva cada uno, filtros (estado, tipo, compras de
  prueba), búsqueda y **descarga CSV**. En la ficha: pasar a fabricación /
  enviado (con nº de seguimiento y aviso al cliente), cancelar, **devolver** y
  enlace al pago en Stripe. El historial dice si salieron los dos correos.
- **Precios**: además de editar, la tabla de lo que paga el cliente ahora por
  referencia (con la promoción aplicada).
- **Estado** (`/admin/estado`): comprobaciones en vivo de variables, dominio,
  base de datos, precios, clave de Stripe, permiso de devoluciones, webhook,
  correos, pedidos atascados, indexación y la última compra de prueba.
- **Compra de prueba de 1 €** (referencia oculta, solo para administradores):
  pasa por el mismo camino que un cliente y marca cada paso al volver de Stripe.
  No cuenta en las cifras. Los pedidos pagados en **modo test de Stripe**
  (como el de julio, `cs_test_…`) también se tratan como prueba.

| # | Qué | Quién |
|---|---|---|
| T1 | Dar a la clave restringida de Stripe el permiso **Refunds: Write** (además de Checkout Sessions, Products, Prices y Shipping Rates: Write). Sin él, «Devolver» del panel avisa y hay que devolver desde Stripe | Tú |
| T2 | Tras el deploy: `/admin/estado` → **Hacer compra de prueba de 1 €** → comprobar los 5 pasos → **Devolver** | Tú |
| T3 | Repetir la prueba antes del Black Friday y tras cada cambio importante | Tú |

---

## S · SEO (programado el 28 oct 2026; falta activarlo fuera del código)

Ya hecho en el código: idioma por URL (castellano en la raíz, inglés en
`/en/…`) con `hreflang`, `robots.txt` y `sitemap.xml` generados, canonical,
Open Graph/Twitter, datos estructurados (Organization, WebSite, Product con
precio y disponibilidad, Breadcrumb), `noindex` en carrito, cuenta y pedidos,
iconos e imágenes WebP (`npm run images`, se ejecuta solo en `dev`/`build`).

**14-11-2026:** la ficha publica un `ProductGroup` con las 10 variantes (SKU,
acabado, medida, precio vigente con promoción, envío gratuito a los 11 países
del checkout), y cada variante tiene su URL (`?finish=…&width=…&et=…` abre la
ficha ya configurada). `/contacto`, la ficha y el carrito ya salen traducidos
en inglés (antes `/en/contacto` y parte de la ficha estaban en castellano) y
`/contacto` tiene su `h1`.

**Idiomas (14-11-2026):** todas las pantallas que se pueden ver con la preventa
apagada salen en castellano y en inglés (también acceso de admin, recuperar y
cambiar contraseña, pedido confirmado, pago cancelado, 404, páginas legales y
textos para lectores de pantalla). El cliente que compra en inglés ve el pago
de Stripe en inglés y recibe el correo de confirmación en inglés; el aviso a
la tienda sigue en castellano e indica el idioma del cliente.

Siguen **solo en castellano**, a propósito:
- El panel `/admin` (uso interno del equipo).
- Las pantallas y correos de la **preventa** (desactivada): reservas, «Mi
  cuenta», registro. Traducirlas al activarla.
- Los correos de **Supabase Auth** (enlace de acceso y recuperar contraseña):
  se editan en Supabase → Authentication → Emails (un solo idioma).

| # | Qué | Quién |
|---|---|---|
| S1 | `SITE_URL=https://www.samoraiwheels.com` en Vercel (lo usan canonical y sitemap; sin él se usa el host de la petición) | Tú |
| S2 | Dar de alta **Google Search Console** (propiedad de dominio, verificación por DNS en Vercel) y enviar `https://www.samoraiwheels.com/sitemap.xml` | Tú |
| S3 | Lo mismo en **Bing Webmaster Tools** (puede importar desde Search Console) | Tú |
| S4 | Validar la ficha en [Rich Results Test](https://search.google.com/test/rich-results) tras el deploy | Tú |
| S5 | URLs de redes sociales (Instagram, etc.) → las añado como `sameAs` en los datos de la marca | Cliente |
| S6 | Al tener los textos legales definitivos: quitar el `noindex` de `/legal`, `/privacidad` y `/cookies`. Al activar The Dealers: quitar su `noindex` y añadirlo al sitemap | Yo |
| S7 | Opcional: imagen para compartir con marca (logo + claim) en lugar del recorte del hero (`public/images/og/samorai-og.jpg`, 1200×630) | Diseño |
| S8 | Con la política de devoluciones (D): añadir `hasMerchantReturnPolicy` a los datos de producto (Google lo pide para Shopping) y el plazo de entrega a `shippingDetails` | Yo |

---

## E · Variables para Vercel

Vercel → proyecto → **Settings → Environment Variables** → entorno
**Production** → *Import .env*. Pega esto relleno y **borra el borrador
después** (contiene secretos):

```
STRIPE_SECRET_KEY=rk_live_...............................
STRIPE_WEBHOOK_SECRET=whsec_.............................
SITE_URL=https://www.samoraiwheels.com
SUPABASE_URL=https://yllcvbttbkceofvkicix.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_.....................
RESEND_API_KEY=re_.......................................
EMAIL_FROM=SAMORAI <pedidos@samoraiwheels.com>
SHOP_ORDER_EMAIL=pedidos@samoraiwheels.com
CONTACT_EMAIL=isainzmorales@samoraiwheels.com
SUPABASE_ANON_KEY=.......................................
# Solo cuando se active la preventa (PRESALE_ENABLED=true):
# ACCESS_LINK_SECRET=....................................
# CRON_SECRET=...........................................
# PRESALE_BULK_EMAILS_ENABLED=
# PRESALE_LIVE_PAYMENTS_ENABLED=
```

De dónde sale cada una:

| Variable | De dónde | Ojo |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Live → API keys → Create restricted key | Debe empezar por **`rk_live_`**. Si pone `test`, **no cobras dinero real** |
| `STRIPE_WEBHOOK_SECRET` | Stripe Live → Webhooks → tu endpoint → Signing secret | **No** es el de `stripe listen` ni el de Test |
| `SITE_URL` | Tu dominio | **Con `www`**, `https://` y sin barra final |
| `SUPABASE_URL` | Ya lo tienes (mismo en test y producción) | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | Secreta: salta RLS. Solo servidor |
| `RESEND_API_KEY` | Resend → API Keys | Permiso *Sending access*, no *Full access* |
| `EMAIL_FROM` | Buzón del dominio verificado | **No** `onboarding@resend.dev` |
| `SHOP_ORDER_EMAIL` | Decisión tuya | Admite varias separadas por comas |
| `CONTACT_EMAIL` | Decisión tuya | Admite varias separadas por comas |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API (clave *anon* / *publishable*) | Pública, pero solo la usa el servidor |
| `ACCESS_LINK_SECRET` | Genéralo tú: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` | Cambiarlo invalida todos los enlaces enviados |
| `CRON_SECRET` | Genéralo igual | El mismo valor va en Supabase Vault (`presale_cron_secret`) |
| `PRESALE_BULK_EMAILS_ENABLED` | Vacío hasta que el cliente lo valide | `true` = salen lanzamiento, recordatorios y caducidades |
| `PRESALE_LIVE_PAYMENTS_ENABLED` | Vacío hasta que el cliente lo valide | Con clave Live y sin `true`, la preventa **no cobra** |

**No pongas** `STRIPE_FALLBACK_PRICE_CENTS` en producción: haría que una
referencia sin precio se cobrase a un importe inventado.

**Tras guardar las variables hay que volver a desplegar** — se leen al arrancar.
Si falta alguna, el arranque lo avisa en los logs de Vercel:
`[config] revisar configuración de producción: …`

---

## F · Prueba final antes de abrir

1. **Compra de prueba de 1 €** desde `/admin/estado` (ver **T**): comprueba
   cobro, webhook, pedido, correo al cliente y aviso a la tienda, y la devuelve.
2. Opcional, para probar además el carrito y las promociones: una compra real
   de una llanta (275 €) y devolverla desde su pedido en `/admin/pedidos`.
3. Prueba el formulario de `/contacto` (en castellano y en `/en/contacto`).

---

## Resumen: lo que necesito de ti

1. **Conectar el MCP de Stripe a la cuenta Live** → creo los precios (A2).
2. Pasarme, cuando los tengas, **los textos legales** (B) → los maqueto.
3. Decirme el **plazo de entrega y la política de devoluciones** (D) → los
   añado a la ficha y a los correos.

Las claves (A3, A4, C2) y los DNS (C1) **hazlos tú**: no debo manejar secretos
ni acceder a los paneles de las cuentas.
