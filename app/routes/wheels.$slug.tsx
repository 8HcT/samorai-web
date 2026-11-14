import type { Route } from './+types/wheels.$slug';
import { useEffect, useMemo, useState } from 'react';
import { data, Link, useActionData, useNavigation, useSearchParams } from 'react-router';
import {
  getProductBySlug,
  getWidthsForFinish,
  getEtsForWidth,
  findExactVariant,
} from '~/data/products';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { useCart } from '~/lib/cart/CartContext';
import { formatPrice } from '~/lib/money';
import { buildPriceBook, lowestPrice } from '~/lib/pricing';
import { loadPricing } from '~/lib/pricing.server';
import { PriceTag, PromoBadge } from '~/components/PriceTag';
import { formatSize, formatEt } from '~/lib/format';
import { Button } from '~/components/Button';
import { SpecList } from '~/components/SpecList';
import { ProductMedia } from '~/components/ProductMedia';
import { FinishDot } from '~/components/FinishDot';
import { readFinishImages } from '~/lib/product-images.server';
import { useLocale, useLocalePath, useT } from '~/i18n/useT';
import { localizePath } from '~/i18n/paths';
import { t as translations } from '~/i18n/config';
import { optimizedSrc } from '~/lib/images';
import { absoluteUrl, breadcrumbJsonLd, fill, rootSeoData, seoMeta, seoStrings } from '~/lib/seo';
import type { ProductOffer } from '~/lib/presale/types';
import { getProductOffer } from '~/lib/presale/offers.server';
import { getSessionUser } from '~/lib/auth/session.server';
import { handleProductPurchase, type PurchaseActionData } from '~/lib/presale/product-actions.server';
import { PresalePanel } from '~/components/presale/PresalePanel';
import { SHIPPING_COST_CENTS, SHIPPING_COUNTRIES } from '~/lib/shipping';

/** Disponibilidad schema.org según la tirada / venta directa. */
const AVAILABILITY: Record<ProductOffer['mode'], string> = {
  legacy: 'https://schema.org/InStock',
  direct: 'https://schema.org/InStock',
  presale: 'https://schema.org/PreOrder',
  upcoming: 'https://schema.org/PreOrder',
  sold_out: 'https://schema.org/SoldOut',
  closed: 'https://schema.org/OutOfStock',
  unavailable: 'https://schema.org/OutOfStock',
};

export function meta(args: Route.MetaArgs) {
  const { data } = args;
  if (!data?.product) return [{ title: 'SAMORAI' }, { name: 'robots', content: 'noindex' }];
  const { product, galleryImages, offer, priceBook } = data;
  const { origin, locale } = rootSeoData(args);
  const s = seoStrings(args);

  // Precios a pagar (con la promoción vigente, si la hay).
  const prices = product.variants.map((v) => priceBook[v.id]?.finalCents).filter((c): c is number => c != null);
  const low = Math.min(...prices) / 100;
  const price = locale === 'es' ? `${low} €` : `€${low}`;
  const description = fill(s.product.description, { name: product.name, price });
  const tr = translations(locale);
  const finishName = (id: string) => tr.finishNames[id] ?? product.finishes.find((f) => f.id === id)?.name ?? id;
  const finishImage = (id: string) =>
    absoluteUrl(origin, galleryImages[id]?.[0] ?? product.finishes.find((f) => f.id === id)?.images[0] ?? '');
  const images = product.finishes.map((f) => finishImage(f.id));
  const path = localizePath(`/the-wheels/${product.slug}`, locale);
  const url = absoluteUrl(origin, path);
  // Si no se pudo leer el stock, mejor no declarar nada que declarar «agotado».
  const availability = offer.mode === 'unavailable' && offer.reason === 'error' ? null : AVAILABILITY[offer.mode];

  // Envío gratuito a los países del checkout (mismo origen de datos).
  const shippingDetails = {
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: SHIPPING_COST_CENTS / 100, currency: 'EUR' },
    shippingDestination: SHIPPING_COUNTRIES.map((country) => ({ '@type': 'DefinedRegion', addressCountry: country })),
  };

  return seoMeta(args, {
    title: fill(s.product.title, { name: product.name }),
    description,
    type: 'product',
    image: images[0],
    imageAlt: `SAMORAI ${product.name}`,
    jsonLd: [
      {
        // Un modelo con variantes (acabado × medida/ET): formato de Google
        // para fichas de producto y resultados de Shopping.
        '@context': 'https://schema.org',
        '@type': 'ProductGroup',
        '@id': `${url}#product`,
        productGroupID: product.id,
        name: `SAMORAI ${product.name}`,
        description,
        url,
        image: images,
        brand: { '@type': 'Brand', name: 'SAMORAI' },
        category: 'Vehicles & Parts > Vehicle Parts & Accessories > Motor Vehicle Wheel Systems > Motor Vehicle Rims & Wheels',
        material: tr.product.specValues[product.specs.material] ?? product.specs.material,
        variesBy: ['https://schema.org/color', 'https://schema.org/size'],
        hasVariant: product.variants
          .filter((v) => priceBook[v.id])
          .map((v) => {
            const p = priceBook[v.id];
            const size = `${formatSize(v.diameter, v.width, locale)} ${formatEt(v.et)}`;
            // Cada variante tiene su URL: la ficha la abre ya configurada.
            const variantUrl = `${url}?finish=${v.finishId}&width=${v.width}&et=${v.et}`;
            return {
              '@type': 'Product',
              sku: v.id,
              name: `SAMORAI ${product.name} ${finishName(v.finishId)} ${size}`,
              image: finishImage(v.finishId),
              color: finishName(v.finishId),
              size,
              offers: {
                '@type': 'Offer',
                url: variantUrl,
                price: (p.finalCents / 100).toFixed(2),
                priceCurrency: 'EUR',
                // Precio de promoción: vale hasta el fin de la promoción.
                ...(p.promotion ? { priceValidUntil: p.promotion.endsAt.slice(0, 10) } : {}),
                itemCondition: 'https://schema.org/NewCondition',
                ...(availability ? { availability } : {}),
                shippingDetails,
                seller: { '@id': `${origin}/#organization` },
              },
            };
          }),
      },
      breadcrumbJsonLd(origin, [
        { name: s.breadcrumbHome, path: localizePath('/', locale) },
        { name: translations(locale).nav.wheels, path: localizePath('/the-wheels', locale) },
        { name: product.name, path: localizePath(`/the-wheels/${product.slug}`, locale) },
      ]),
    ],
  });
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const product = getProductBySlug(params.slug);
  if (!product) {
    throw new Response('Product not found', { status: 404 });
  }
  // Imágenes reales por acabado (lee la carpeta; si no, usa la lista por defecto).
  const galleryImages: Record<string, string[]> = {};
  for (const f of product.finishes) {
    galleryImages[f.id] = await readFinishImages(product.slug, f.id, f.images);
  }
  // Tirada de fabricación y stock REAL (PostgreSQL, en cada petición). Sin
  // tirada → la ficha funciona con el carrito como siempre.
  const [offer, session, pricing] = await Promise.all([
    getProductOffer(product),
    getSessionUser(request),
    loadPricing(),
  ]);
  const priceBook = buildPriceBook(pricing, [product]);
  return data(
    { product, galleryImages, offer, priceBook, userEmail: session.user?.email ?? null },
    { headers: session.auth?.headers }
  );
}

/** «Reservar mi juego» / «Comprar ahora» → Stripe Checkout. */
export async function action({ request, params }: Route.ActionArgs) {
  return handleProductPurchase(request, params.slug);
}

export default function WheelDetail({ loaderData }: Route.ComponentProps) {
  const { product, galleryImages, offer, priceBook, userEmail } = loaderData;
  const t = useT();
  const locale = useLocale();
  const lp = useLocalePath();
  const { add } = useCart();
  const [searchParams] = useSearchParams();
  const actionData = useActionData<PurchaseActionData>();
  const navigation = useNavigation();
  const purchasing = navigation.state !== 'idle' && navigation.formMethod?.toLowerCase() === 'post';

  // Acabado preseleccionado vía ?finish=<id> (desde la lista de /the-wheels).
  const finishFromUrl = searchParams.get('finish');
  const initialFinishId = product.finishes.some((f) => f.id === finishFromUrl)
    ? finishFromUrl
    : null;

  // Medida y ET preseleccionados vía ?width=9&et=35 (enlaces a una variante
  // concreta, p. ej. desde Google Shopping). Solo si existen para ese acabado.
  const widthFromUrl = Number(searchParams.get('width'));
  const initialWidth =
    initialFinishId && getWidthsForFinish(product, initialFinishId).includes(widthFromUrl) ? widthFromUrl : null;
  const etFromUrl = Number(searchParams.get('et'));
  const initialEt =
    initialFinishId && initialWidth != null && getEtsForWidth(product, initialFinishId, initialWidth).includes(etFromUrl)
      ? etFromUrl
      : null;

  // El acabado se elige por id estable (no por texto).
  const [finishId, setFinishId] = useState<string | null>(initialFinishId);
  const [width, setWidth] = useState<number | null>(initialWidth);
  const [et, setEt] = useState<number | null>(initialEt);
  // Por defecto 4 (juego de llantas); el usuario puede cambiarlo.
  const [quantity, setQuantity] = useState(4);
  const [added, setAdded] = useState(false);
  // Imagen activa de la galería (índice dentro de las imágenes del acabado).
  const [activeImage, setActiveImage] = useState(0);
  // Lightbox de zoom sobre la imagen grande.
  const [zoomOpen, setZoomOpen] = useState(false);

  const previewFinish =
    product.finishes.find((f) => f.id === finishId) ?? product.finishes[0];

  // Imágenes de la galería del acabado activo (las reales de la carpeta, o la
  // lista por defecto si el loader no pudo leerla).
  const galleryList =
    galleryImages[previewFinish?.id ?? ''] ?? previewFinish?.images ?? [];

  // Al cambiar de acabado, volver a la imagen principal.
  useEffect(() => {
    setActiveImage(0);
  }, [finishId]);

  // Lightbox: cerrar con Esc, navegar con flechas y bloquear el scroll de fondo.
  useEffect(() => {
    if (!zoomOpen) return;
    const total = galleryList.length;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setZoomOpen(false);
      if (total > 1 && e.key === 'ArrowRight') setActiveImage((i) => (i + 1) % total);
      if (total > 1 && e.key === 'ArrowLeft') setActiveImage((i) => (i - 1 + total) % total);
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [zoomOpen, galleryList.length]);

  useEffect(() => {
    trackEvent('product_viewed', {
      productId: product.id,
      productName: product.name,
      slug: product.slug,
    });
  }, [product.id, product.name, product.slug]);

  // Medidas disponibles para el acabado elegido.
  const widths = useMemo(
    () => (finishId ? getWidthsForFinish(product, finishId) : []),
    [product, finishId]
  );

  // ET disponibles para la medida elegida.
  const ets = useMemo(
    () => (finishId && width != null ? getEtsForWidth(product, finishId, width) : []),
    [product, finishId, width]
  );

  // Al cambiar de medida: conservar el ET si sigue siendo válido (p. ej. el
  // que venía en la URL); si no, auto-seleccionarlo cuando solo hay uno.
  useEffect(() => {
    if (width == null) { setEt(null); return; }
    setEt((current) => (current != null && ets.includes(current) ? current : ets.length === 1 ? ets[0] : null));
  }, [width, ets]);

  // Referencia exacta (o undefined si la combinación no es válida/completa).
  const variant = useMemo(
    () =>
      finishId && width != null && et != null
        ? findExactVariant(product, finishId, width, et)
        : undefined,
    [product, finishId, width, et]
  );

  // "Desde X €" = precio mínimo (a pagar) entre las referencias del acabado
  // elegido, o de todo el modelo si aún no hay acabado.
  const fromPrice = useMemo(
    () =>
      lowestPrice(
        product.variants
          .filter((v) => finishId == null || v.finishId === finishId)
          .map((v) => priceBook[v.id])
      ),
    [product.variants, priceBook, finishId]
  );

  // Precio unitario según la medida (aparece al elegir tamaño). Depende del
  // ancho y, si hay promoción por acabado, del acabado.
  const unitPrice =
    width != null
      ? lowestPrice(
          product.variants
            .filter((v) => v.width === width && (finishId == null || v.finishId === finishId))
            .map((v) => priceBook[v.id])
        )
      : null;

  function handleFinishSelect(id: string) {
    setFinishId(id);
    setWidth(null);
    setEt(null);
    setAdded(false);
    trackEvent('finish_selected', { productId: product.id, finishId: id });
  }

  function handleWidthSelect(w: number) {
    setWidth(w);
    setAdded(false);
    trackEvent('config_size_selected', { productId: product.id, finishId: finishId!, width: w });
  }

  function handleEtSelect(value: number) {
    setEt(value);
    setAdded(false);
    trackEvent('config_et_selected', { productId: product.id, finishId: finishId!, et: value });
  }

  function handleAddToCart() {
    if (!variant) return;
    add(variant.id, quantity);
    trackEvent('add_to_cart_clicked', { productId: product.id, variantId: variant.id, quantity });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
  }

  // Textos que dependen del idioma: nombres de acabado y valores técnicos.
  const finishName = (f: { id: string; name: string } | undefined) => (f ? t.finishNames[f.id] ?? f.name : '');
  const specValue = (v: string) => t.product.specValues[v] ?? v;
  const decimalSep = locale === 'es' ? ',' : '.';

  const specs = [
    { label: t.product.specDiameter, value: '18"' },
    { label: t.product.specPcd, value: product.specs.pcd },
    { label: t.product.specCb, value: `${String(product.specs.cbBase).replace('.', decimalSep)} mm` },
    { label: t.product.specMaterial, value: specValue(product.specs.material) },
    { label: t.product.specProcess, value: specValue(product.specs.process) },
    { label: t.product.specFinish, value: specValue(product.specs.finish) },
    { label: t.product.specCap, value: specValue(product.specs.capLogo) },
  ];

  return (
    <div className="section">
      <div className="container">
        <div className="product-detail">
          {/* Gallery — swatches de color al lado, miniaturas debajo de la foto */}
          <div className="product-detail__gallery">
            <div className="gallery">
              {/* Selector visual de acabado (discos de color) */}
              <div className="thumbs thumbs--finish" role="list" aria-label={t.product.selectFinishAria}>
                {product.finishes.map((f) => (
                  <button
                    key={f.id}
                    role="listitem"
                    className={f.id === previewFinish?.id ? 'active' : undefined}
                    onClick={() => handleFinishSelect(f.id)}
                    aria-label={fill(t.product.viewFinish, { finish: finishName(f) })}
                    aria-pressed={f.id === finishId}
                    title={finishName(f)}
                  >
                    <FinishDot color={f.color} size="lg" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="main main--zoomable"
                onClick={() => setZoomOpen(true)}
                aria-label={fill(t.product.zoomAria, { name: product.name, finish: finishName(previewFinish) })}
              >
                <ProductMedia
                  color={previewFinish?.color ?? 'Anthracite Grey'}
                  src={galleryList[activeImage]}
                  alt={`${product.name} — ${finishName(previewFinish)}`}
                  sizes="(max-width: 900px) 100vw, 55vw"
                  priority
                />
                <span className="main__zoom-hint" aria-hidden="true">
                  <span className="main__zoom-icon" />
                  {t.product.zoom}
                </span>
                {product.featured && (
                  <span className="badges" style={{ position: 'absolute', top: '14px', left: '14px', zIndex: 2 }}>
                    <span className="badge badge-new">New</span>
                  </span>
                )}
              </button>

            {/* Miniaturas de imágenes: dentro de la retícula, alineadas a la
                columna de la foto grande (misma anchura y mismo módulo). */}
            {galleryList.length > 1 && (
              <div className="gallery-strip" role="list" aria-label={t.product.imagesAria}>
                {galleryList.map((img, i) => (
                  <button
                    key={i}
                    role="listitem"
                    className={i === activeImage ? 'active' : undefined}
                    onMouseEnter={() => setActiveImage(i)}
                    onClick={() => setActiveImage(i)}
                    aria-label={fill(t.product.viewImage, { n: String(i + 1) })}
                    aria-pressed={i === activeImage}
                  >
                    <ProductMedia
                      color={previewFinish?.color ?? 'Anthracite Grey'}
                      src={img}
                      alt={`${product.name} — ${finishName(previewFinish)} (${i + 1})`}
                      sizes="120px"
                    />
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>

          {/* Info + configuración inline */}
          <div className="product-detail__info">
            <p className="product-detail__model">Wheels · {product.model}</p>
            <h1 className="product-detail__name">{product.name}</h1>

            {/* Titular de precio (el precio dinámico va abajo, junto al botón) */}
            <p className="product-detail__price">
              <PriceTag price={fromPrice} prefix={t.product.from} wasLabel={t.product.was} />
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginLeft: 'var(--space-2)' }}>
                {t.product.perWheel}
              </span>
            </p>
            {fromPrice?.promotion && (
              <p style={{ marginTop: 'calc(-1 * var(--space-2))', marginBottom: 'var(--space-4)' }}>
                <PromoBadge promotion={fromPrice.promotion} />
              </p>
            )}
            <p className="caption" style={{ marginTop: 'calc(-1 * var(--space-3))', marginBottom: 'var(--space-6)' }}>
              {t.product.vatNote}
            </p>

            {/* 1 · Acabado */}
            <div className="product-detail__color-selector">
              <p className="product-detail__option-title">
                {t.product.finish}
                {finishId && (
                  <span style={{ color: 'var(--color-text-primary)', textTransform: 'none', letterSpacing: 0 }}>
                    {' '}— {finishName(previewFinish)}
                  </span>
                )}
              </p>
              <div className="pills" role="group" aria-label={t.product.selectFinishAria}>
                {product.finishes.map((f) => (
                  <button
                    key={f.id}
                    className={`pill pill--finish${f.id === finishId ? ' active' : ''}`}
                    onClick={() => handleFinishSelect(f.id)}
                    aria-pressed={f.id === finishId}
                    aria-label={finishName(f)}
                  >
                    <FinishDot color={f.color} />
                    {finishName(f)}
                  </button>
                ))}
              </div>
            </div>

            {/* 2 · Medida (tras elegir acabado) */}
            {finishId && (
              <div className="product-detail__color-selector">
                <p className="product-detail__option-title">{t.product.size}</p>
                <div className="pills" role="group" aria-label={t.product.selectSizeAria}>
                  {widths.map((w) => (
                    <button
                      key={w}
                      className={`pill${w === width ? ' active' : ''}`}
                      onClick={() => handleWidthSelect(w)}
                      aria-pressed={w === width}
                    >
                      {formatSize(18, w, locale)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 3 · ET (tras elegir medida; solo los válidos) */}
            {finishId && width != null && (
              <div className="product-detail__color-selector">
                <p className="product-detail__option-title">{t.product.offset}</p>
                <div className="pills" role="group" aria-label={t.product.selectEtAria}>
                  {ets.map((value) => (
                    <button
                      key={value}
                      className={`pill${value === et ? ' active' : ''}`}
                      onClick={() => handleEtSelect(value)}
                      aria-pressed={value === et}
                    >
                      {formatEt(value)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Características generales (solo lectura) */}
            <div style={{ marginBottom: 'var(--space-8)' }}>
              <p className="product-detail__option-title">{t.product.generalSpecs}</p>
              <SpecList specs={specs} />
            </div>

            {/* Producto con tirada de fabricación: preventa / compra directa
                por juegos con stock real (sustituye al carrito). */}
            {offer.mode !== 'legacy' && (
              <PresalePanel
                offer={offer}
                productId={product.id}
                variant={variant}
                width={width}
                finishSelected={finishId != null}
                defaultEmail={userEmail}
                error={actionData?.error ?? null}
                submitting={purchasing}
              />
            )}

            {/* Precio dinámico. El precio depende SOLO del ancho, así que se
                muestra el total en cuanto se elige la medida (aunque falte el
                ET); si falta el ET, se añade el aviso "elige ET". */}
            {offer.mode === 'legacy' && finishId && (
              <div className="product-detail__summary" aria-live="polite">
                {width != null && unitPrice != null ? (
                  <>
                    <PriceTag price={unitPrice} quantity={quantity} wasLabel={t.product.was} className="product-detail__summary-total" />
                    <span className="product-detail__summary-detail">
                      {quantity} × {formatPrice(unitPrice.finalCents)} · {t.product.vatIncluded}
                      {unitPrice.promotion ? ` · ${unitPrice.promotion.badge} −${unitPrice.promotion.percentOff}%` : ''}
                      {variant ? '' : t.product.chooseEt}
                    </span>
                  </>
                ) : (
                  <span className="product-detail__summary-detail">{t.product.selectSizeForPrice}</span>
                )}
              </div>
            )}

            {/* Cantidad + añadir al carrito (solo productos sin tirada) */}
            {offer.mode !== 'legacy' ? null : finishId ? (
              <div className="product-detail__buy">
                <div className="config-qty" aria-label={t.product.quantity}>
                  <button className="config-qty__btn" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label={t.product.decrease}>−</button>
                  <span className="config-qty__count" aria-live="polite">{quantity}</span>
                  <button className="config-qty__btn" onClick={() => setQuantity((q) => q + 1)} aria-label={t.product.increase}>+</button>
                </div>
                <Button
                  variant="primary"
                  size="large"
                  className="product-detail__add-to-cart"
                  onClick={handleAddToCart}
                  disabled={!variant}
                >
                  {added ? t.product.added : t.product.addToCart}
                </Button>
              </div>
            ) : (
              <p className="caption">{t.product.selectFinish}</p>
            )}
            {offer.mode === 'legacy' && (
              <p className="product-detail__note">
                {finishId && !variant
                  ? t.product.chooseSizeEt
                  : t.product.securePayment}
              </p>
            )}

            {/* Fitment note */}
            <div
              style={{
                marginTop: 'var(--space-6)',
                padding: 'var(--space-4)',
                background: 'var(--color-bg-elevated)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-muted)',
                lineHeight: 'var(--leading-relaxed)',
              }}
            >
              {t.product.fitmentNote}{' '}
              <Link to={lp('/contacto')} style={{ color: 'var(--color-accent)' }}>{t.product.fitmentLink}</Link>
            </div>

            {/* Description */}
            <div style={{ marginTop: 'var(--space-10)', paddingTop: 'var(--space-8)', borderTop: '1px solid var(--color-border)' }}>
              <p className="label" style={{ marginBottom: 'var(--space-4)' }}>{t.product.about}</p>
              <p style={{ maxWidth: 'none' }}>{t.product.description}</p>
            </div>
          </div>
        </div>

        {/* Hub rings callout — OCULTO: los hub rings aún no están a la venta.
        <div style={{ marginTop: 'var(--space-16)' }}>
          <FitmentCallout source="wheel_detail_page" />
        </div>
        */}
      </div>

      {/* Lightbox de zoom: imagen a tamaño completo sobre fondo oscurecido. */}
      {zoomOpen && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${product.name} — ${finishName(previewFinish)}`}
          onClick={() => setZoomOpen(false)}
        >
          <button
            type="button"
            className="lightbox__close"
            onClick={() => setZoomOpen(false)}
            aria-label={t.product.close}
            autoFocus
          >
            ×
          </button>

          {galleryList.length > 1 && (
            <button
              type="button"
              className="lightbox__nav lightbox__nav--prev"
              onClick={(e) => {
                e.stopPropagation();
                setActiveImage((i) => (i - 1 + galleryList.length) % galleryList.length);
              }}
              aria-label={t.product.prevImage}
            >
              ‹
            </button>
          )}

          <img
            className="lightbox__img"
            src={optimizedSrc(galleryList[activeImage], 1920)}
            onError={(e) => {
              // Sin variante WebP → imagen original.
              const original = new URL(galleryList[activeImage], window.location.href).href;
              if (e.currentTarget.src !== original) e.currentTarget.src = original;
            }}
            alt={`${product.name} — ${finishName(previewFinish)}`}
            onClick={(e) => e.stopPropagation()}
          />

          {galleryList.length > 1 && (
            <>
              <button
                type="button"
                className="lightbox__nav lightbox__nav--next"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveImage((i) => (i + 1) % galleryList.length);
                }}
                aria-label={t.product.nextImage}
              >
                ›
              </button>
              <p className="lightbox__counter">
                {activeImage + 1} / {galleryList.length}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
