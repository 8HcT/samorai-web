import type { Route } from './+types/wheels.$slug';
import { useEffect, useState } from 'react';
import { getProductBySlug } from '~/data/products';
import type { WheelColor } from '~/types/product';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { useCart } from '~/lib/cart/CartContext';
import { formatPrice } from '~/lib/money';
import { Button } from '~/components/Button';
import { SpecList } from '~/components/SpecList';
import { VariantTable } from '~/components/VariantTable';
import { FitmentCallout } from '~/components/FitmentCallout';

export function meta({ data }: Route.MetaArgs) {
  if (!data?.product) return [{ title: 'Product Not Found — SAMORAI' }];
  return [
    { title: `${data.product.name} — SAMORAI Wheels` },
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

const PLACEHOLDER_CLASS: Record<WheelColor, string> = {
  'Anthracite Grey': 'product-card__image-placeholder--anthracite',
  'Black Metallic': 'product-card__image-placeholder--black',
  'Silver Metallic': 'product-card__image-placeholder--silver',
  'Raw Aluminum': 'product-card__image-placeholder--aluminum',
};

export default function WheelDetail({ loaderData }: Route.ComponentProps) {
  const { product } = loaderData;
  const { add } = useCart();
  const [activeColor, setActiveColor] = useState<WheelColor>(product.colors[0]);
  const [added, setAdded] = useState(false);

  const variants = product.variants.filter(
    (v) => v.color === activeColor && v.stockStatus !== 'out_of_stock'
  );

  const [selectedVariantId, setSelectedVariantId] = useState<string>(variants[0]?.id ?? '');
  const selectedVariant =
    variants.find((v) => v.id === selectedVariantId) ?? variants[0];

  useEffect(() => {
    trackEvent('product_viewed', {
      productId: product.id,
      productName: product.name,
      slug: product.slug,
    });
  }, [product.id, product.name, product.slug]);

  // Al cambiar de acabado, seleccionar la primera talla disponible.
  useEffect(() => {
    const first = product.variants.find(
      (v) => v.color === activeColor && v.stockStatus !== 'out_of_stock'
    );
    setSelectedVariantId(first?.id ?? '');
    setAdded(false);
  }, [activeColor, product.variants]);

  function handleColorSelect(color: WheelColor) {
    setActiveColor(color);
    trackEvent('color_selected', { productId: product.id, color });
  }

  function handleAddToCart() {
    if (!selectedVariant) return;
    add(selectedVariant.id, 1);
    trackEvent('add_to_cart_clicked', {
      productId: product.id,
      variantId: selectedVariant.id,
      quantity: 1,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
  }

  const specs = [
    { label: 'PCD', value: product.specs.pcd },
    { label: 'Center Bore', value: `${product.specs.cbBase}mm` },
    { label: 'Max Load', value: `${product.specs.maxLoad}kg / wheel` },
    { label: 'Material', value: product.specs.material },
    { label: 'Finish', value: product.specs.finish },
    { label: 'Cap Logo', value: product.specs.capLogo },
  ];

  return (
    <div className="section">
      <div className="container">
        <div className="product-detail">
          {/* Gallery (componente 14) */}
          <div className="product-detail__gallery">
            <div className="gallery">
              <div className="thumbs" role="list" aria-label="Color previews">
                {product.colors.map((color) => (
                  <button
                    key={color}
                    role="listitem"
                    className={color === activeColor ? 'active' : undefined}
                    onClick={() => handleColorSelect(color)}
                    aria-label={`Switch to ${color}`}
                    aria-pressed={color === activeColor}
                  >
                    <div
                      className={`product-card__image-placeholder ${PLACEHOLDER_CLASS[color]}`}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </button>
                ))}
              </div>
              <div className="main" role="img" aria-label={`${product.name} in ${activeColor}`} style={{ position: 'relative' }}>
                <div
                  className={`product-card__image-placeholder ${PLACEHOLDER_CLASS[activeColor]}`}
                  style={{ width: '100%', height: '100%' }}
                >
                  <div className="product-card__wheel-icon" style={{ width: '46%', height: '46%' }} />
                </div>
                {product.featured && (
                  <div className="badges" style={{ position: 'absolute', top: '14px', left: '14px' }}>
                    <span className="badge badge-new">New</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="product-detail__info">
            <p className="product-detail__model">Wheels · {product.model}</p>
            <h1 className="product-detail__name">{product.name}</h1>
            <p className="product-detail__price">
              {formatPrice(selectedVariant?.priceCents)}
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginLeft: 'var(--space-2)' }}>
                / unidad
              </span>
            </p>

            {/* Color selector */}
            <div className="product-detail__color-selector">
              <p className="product-detail__option-title">
                Finish —{' '}
                <span style={{ color: 'var(--color-text-primary)', textTransform: 'none', letterSpacing: 0 }}>
                  {activeColor}
                </span>
              </p>
              <div className="pills" role="group" aria-label="Select finish">
                {product.colors.map((color) => (
                  <button
                    key={color}
                    className={`pill${color === activeColor ? ' active' : ''}`}
                    onClick={() => handleColorSelect(color)}
                    aria-pressed={color === activeColor}
                    aria-label={color}
                  >
                    {color}
                  </button>
                ))}
              </div>
            </div>

            {/* Size selector */}
            <div className="product-detail__color-selector">
              <p className="product-detail__option-title">Size</p>
              {variants.length > 0 ? (
                <div className="pills" role="group" aria-label="Select size">
                  {variants.map((v) => (
                    <button
                      key={v.id}
                      className={`pill${v.id === selectedVariant?.id ? ' active' : ''}`}
                      onClick={() => setSelectedVariantId(v.id)}
                      aria-pressed={v.id === selectedVariant?.id}
                    >
                      {v.diameter}×{v.width}J ET{v.et}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="caption">No hay tallas disponibles en este acabado.</p>
              )}
            </div>

            {/* Specs */}
            <div style={{ marginBottom: 'var(--space-8)' }}>
              <p className="product-detail__option-title">Specifications</p>
              <SpecList specs={specs} />
            </div>

            <Button
              variant="primary"
              size="large"
              className="product-detail__add-to-cart"
              onClick={handleAddToCart}
              disabled={!selectedVariant}
            >
              {added ? 'Añadido ✓' : 'Añadir al carrito'}
            </Button>
            <p className="product-detail__note">
              El pago se procesa de forma segura con Stripe.
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
              Fitment must be verified per vehicle. Check PCD, center bore, ET range, diameter
              clearance and brake caliper clearance before installation.{' '}
              <a href="/contacto" style={{ color: 'var(--color-accent)' }}>Consultar fitment →</a>
            </div>

            {/* Description */}
            <div style={{ marginTop: 'var(--space-10)', paddingTop: 'var(--space-8)', borderTop: '1px solid var(--color-border)' }}>
              <p className="label" style={{ marginBottom: 'var(--space-4)' }}>About This Wheel</p>
              <p style={{ maxWidth: 'none' }}>{product.description}</p>
            </div>
          </div>
        </div>

        {/* Variants table */}
        <div style={{ marginTop: 'var(--space-16)' }}>
          <h2 style={{ marginBottom: 'var(--space-6)', fontSize: 'var(--text-2xl)' }}>
            Available Sizes — {activeColor}
          </h2>
          <VariantTable variants={variants} />
        </div>

        {/* Hub rings callout */}
        <div style={{ marginTop: 'var(--space-12)' }}>
          <FitmentCallout source="wheel_detail_page" />
        </div>
      </div>
    </div>
  );
}
