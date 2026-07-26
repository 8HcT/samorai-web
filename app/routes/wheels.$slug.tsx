import type { Route } from './+types/wheels.$slug';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  getProductBySlug,
  getWidthsForFinish,
  getEtsForWidth,
  findExactVariant,
} from '~/data/products';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { useCart } from '~/lib/cart/CartContext';
import { formatPrice } from '~/lib/money';
import { unitPriceCentsForWidth } from '~/lib/pricing';
import { formatSize, formatEt } from '~/lib/format';
import { Button } from '~/components/Button';
import { SpecList } from '~/components/SpecList';
import { ProductMedia } from '~/components/ProductMedia';

export function meta({ data }: Route.MetaArgs) {
  if (!data?.product) return [{ title: 'Producto no encontrado | SAMORAI' }];
  return [
    { title: `${data.product.name} | SAMORAI` },
    { name: 'description', content: data.product.shortDescription },
  ];
}

export function loader({ params }: Route.LoaderArgs) {
  const product = getProductBySlug(params.slug);
  if (!product) {
    throw new Response('Product not found', { status: 404 });
  }
  return { product };
}

export default function WheelDetail({ loaderData }: Route.ComponentProps) {
  const { product } = loaderData;
  const { add } = useCart();
  const [searchParams] = useSearchParams();

  // Acabado preseleccionado vía ?finish=<id> (desde la lista de /the-wheels).
  const finishFromUrl = searchParams.get('finish');
  const initialFinishId = product.finishes.some((f) => f.id === finishFromUrl)
    ? finishFromUrl
    : null;

  // El acabado se elige por id estable (no por texto).
  const [finishId, setFinishId] = useState<string | null>(initialFinishId);
  const [width, setWidth] = useState<number | null>(null);
  const [et, setEt] = useState<number | null>(null);
  // Por defecto 4 (juego de llantas); el usuario puede cambiarlo.
  const [quantity, setQuantity] = useState(4);
  const [added, setAdded] = useState(false);
  // Imagen activa de la galería (índice dentro de las imágenes del acabado).
  const [activeImage, setActiveImage] = useState(0);

  const previewFinish =
    product.finishes.find((f) => f.id === finishId) ?? product.finishes[0];

  // Al cambiar de acabado, volver a la imagen principal.
  useEffect(() => {
    setActiveImage(0);
  }, [finishId]);

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

  // Al cambiar de medida, auto-seleccionar el ET si solo hay uno.
  useEffect(() => {
    if (width == null) { setEt(null); return; }
    setEt(ets.length === 1 ? ets[0] : null);
  }, [width, ets]);

  // Referencia exacta (o undefined si la combinación no es válida/completa).
  const variant = useMemo(
    () =>
      finishId && width != null && et != null
        ? findExactVariant(product, finishId, width, et)
        : undefined,
    [product, finishId, width, et]
  );

  // "Desde X €" = precio mínimo entre las referencias.
  const fromCents = useMemo(
    () =>
      Math.min(
        ...product.variants
          .map((v) => v.priceCents)
          .filter((c): c is number => c != null)
      ),
    [product.variants]
  );

  // Precio unitario según la medida (aparece al elegir tamaño).
  const unitCents = width != null ? unitPriceCentsForWidth(width) : null;

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

  const specs = [
    { label: 'Diámetro', value: '18"' },
    { label: 'Anclaje (PCD)', value: product.specs.pcd },
    { label: 'Buje central', value: `${String(product.specs.cbBase).replace('.', ',')} mm` },
    { label: 'Material', value: product.specs.material },
    { label: 'Acabado', value: product.specs.finish },
    { label: 'Tapabuje', value: product.specs.capLogo },
  ];

  return (
    <div className="section">
      <div className="container">
        <div className="product-detail">
          {/* Gallery — imágenes del acabado (principal + extras), clicables */}
          <div className="product-detail__gallery">
            <div className="gallery">
              <div className="thumbs" role="list" aria-label="Imágenes de la llanta">
                {previewFinish?.images.map((img, i) => (
                  <button
                    key={i}
                    role="listitem"
                    className={i === activeImage ? 'active' : undefined}
                    onClick={() => setActiveImage(i)}
                    aria-label={`Ver imagen ${i + 1}`}
                    aria-pressed={i === activeImage}
                  >
                    <ProductMedia
                      color={previewFinish.color}
                      src={img}
                      alt={`${product.name} — ${previewFinish.name} (${i + 1})`}
                    />
                  </button>
                ))}
              </div>
              <div
                className="main"
                role="img"
                aria-label={`${product.name} en ${previewFinish?.name}`}
                style={{ position: 'relative' }}
              >
                <ProductMedia
                  color={previewFinish?.color ?? 'Anthracite Grey'}
                  src={previewFinish?.images[activeImage]}
                  alt={`${product.name} — ${previewFinish?.name}`}
                />
                {product.featured && (
                  <div className="badges" style={{ position: 'absolute', top: '14px', left: '14px', zIndex: 2 }}>
                    <span className="badge badge-new">New</span>
                  </div>
                )}
              </div>
            </div>
            {/* Guía: ruta del archivo de la imagen mostrada (para saber qué subir) */}
            <p className="caption gallery-path">{previewFinish?.images[activeImage]}</p>
          </div>

          {/* Info + configuración inline */}
          <div className="product-detail__info">
            <p className="product-detail__model">Wheels · {product.model}</p>
            <h1 className="product-detail__name">{product.name}</h1>

            {/* Titular de precio (el precio dinámico va abajo, junto al botón) */}
            <p className="product-detail__price">
              Desde {formatPrice(fromCents)}
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginLeft: 'var(--space-2)' }}>
                por llanta
              </span>
            </p>
            <p className="caption" style={{ marginTop: 'calc(-1 * var(--space-3))', marginBottom: 'var(--space-6)' }}>
              IVA incluido. Precio final según la medida seleccionada.
            </p>

            {/* 1 · Acabado */}
            <div className="product-detail__color-selector">
              <p className="product-detail__option-title">
                Acabado
                {finishId && (
                  <span style={{ color: 'var(--color-text-primary)', textTransform: 'none', letterSpacing: 0 }}>
                    {' '}— {previewFinish?.name}
                  </span>
                )}
              </p>
              <div className="pills" role="group" aria-label="Seleccionar acabado">
                {product.finishes.map((f) => (
                  <button
                    key={f.id}
                    className={`pill${f.id === finishId ? ' active' : ''}`}
                    onClick={() => handleFinishSelect(f.id)}
                    aria-pressed={f.id === finishId}
                    aria-label={f.name}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 2 · Medida (tras elegir acabado) */}
            {finishId && (
              <div className="product-detail__color-selector">
                <p className="product-detail__option-title">Medida</p>
                <div className="pills" role="group" aria-label="Seleccionar medida">
                  {widths.map((w) => (
                    <button
                      key={w}
                      className={`pill${w === width ? ' active' : ''}`}
                      onClick={() => handleWidthSelect(w)}
                      aria-pressed={w === width}
                    >
                      {formatSize(18, w)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 3 · ET (tras elegir medida; solo los válidos) */}
            {finishId && width != null && (
              <div className="product-detail__color-selector">
                <p className="product-detail__option-title">ET (offset)</p>
                <div className="pills" role="group" aria-label="Seleccionar ET">
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
              <p className="product-detail__option-title">Características generales</p>
              <SpecList specs={specs} />
            </div>

            {/* Precio dinámico (según medida/ET/cantidad), antes de añadir */}
            {finishId && (
              <div className="product-detail__summary" aria-live="polite">
                {variant && unitCents != null ? (
                  <>
                    <span className="product-detail__summary-total">{formatPrice(unitCents * quantity)}</span>
                    <span className="product-detail__summary-detail">
                      {quantity} × {formatPrice(unitCents)} · IVA incluido
                    </span>
                  </>
                ) : width != null && unitCents != null ? (
                  <>
                    <span className="product-detail__summary-total">{formatPrice(unitCents)}</span>
                    <span className="product-detail__summary-detail">por llanta · IVA incluido — elige ET</span>
                  </>
                ) : (
                  <span className="product-detail__summary-detail">Selecciona una medida para ver el precio</span>
                )}
              </div>
            )}

            {/* Cantidad + añadir al carrito */}
            {finishId ? (
              <div className="product-detail__buy">
                <div className="config-qty" aria-label="Cantidad">
                  <button className="config-qty__btn" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Disminuir cantidad">−</button>
                  <span className="config-qty__count" aria-live="polite">{quantity}</span>
                  <button className="config-qty__btn" onClick={() => setQuantity((q) => q + 1)} aria-label="Aumentar cantidad">+</button>
                </div>
                <Button
                  variant="primary"
                  size="large"
                  className="product-detail__add-to-cart"
                  onClick={handleAddToCart}
                  disabled={!variant}
                >
                  {added ? 'Añadido ✓' : 'Añadir al carrito'}
                </Button>
              </div>
            ) : (
              <p className="caption">Selecciona un acabado para continuar.</p>
            )}
            <p className="product-detail__note">
              {finishId && !variant
                ? 'Elige medida y ET para obtener una referencia válida.'
                : 'El pago se procesa de forma segura con Stripe.'}
            </p>

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
              El fitment debe verificarse por vehículo. Comprueba PCD, buje central, rango de ET,
              diámetro y holgura de pinza de freno antes de instalar.{' '}
              <a href="/contacto" style={{ color: 'var(--color-accent)' }}>Consultar fitment →</a>
            </div>

            {/* Description */}
            <div style={{ marginTop: 'var(--space-10)', paddingTop: 'var(--space-8)', borderTop: '1px solid var(--color-border)' }}>
              <p className="label" style={{ marginBottom: 'var(--space-4)' }}>Sobre esta llanta</p>
              <p style={{ maxWidth: 'none' }}>{product.description}</p>
            </div>
          </div>
        </div>

        {/* Hub rings callout — OCULTO: los hub rings aún no están a la venta.
        <div style={{ marginTop: 'var(--space-16)' }}>
          <FitmentCallout source="wheel_detail_page" />
        </div>
        */}
      </div>
    </div>
  );
}
