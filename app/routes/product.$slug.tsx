import type { Route } from './+types/product.$slug';
import { useEffect, useState } from 'react';
import { getProductBySlug, getVariantsByColor } from '~/data/products';
import type { WheelColor } from '~/types/product';
import { trackEvent } from '~/lib/analytics/trackEvent';
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

const COLOR_CLASS: Record<WheelColor, string> = {
  'Anthracite Grey': 'anthracite',
  'Black Metallic': 'black',
  'Silver Metallic': 'silver',
  'Raw Aluminum': 'raw-aluminum',
};

const PLACEHOLDER_CLASS: Record<WheelColor, string> = {
  'Anthracite Grey': 'product-card__image-placeholder--anthracite',
  'Black Metallic': 'product-card__image-placeholder--black',
  'Silver Metallic': 'product-card__image-placeholder--silver',
  'Raw Aluminum': 'product-card__image-placeholder--aluminum',
};

export default function ProductDetail({ loaderData }: Route.ComponentProps) {
  const { product } = loaderData;
  const [activeColor, setActiveColor] = useState<WheelColor>(product.colors[0]);

  useEffect(() => {
    trackEvent('product_viewed', {
      productId: product.id,
      productName: product.name,
      slug: product.slug,
    });
  }, [product.id, product.name, product.slug]);

  function handleColorSelect(color: WheelColor) {
    setActiveColor(color);
    trackEvent('color_selected', { productId: product.id, color });
  }

  function handleAddToCart() {
    trackEvent('add_to_cart_clicked', {
      productId: product.id,
      variantId: getVariantsByColor(product, activeColor)[0]?.id ?? '',
      quantity: 4,
    });
  }

  const variants = product.variants.filter(
    (v) => v.color === activeColor && v.stockStatus !== 'out_of_stock'
  );

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
          {/* Gallery */}
          <div className="product-detail__gallery">
            <div className="product-detail__main-image">
              <div
                className={`product-card__image-placeholder ${PLACEHOLDER_CLASS[activeColor]}`}
                style={{ width: '100%', height: '100%', aspectRatio: '1' }}
                role="img"
                aria-label={`${product.name} in ${activeColor}`}
              >
                <div className="product-card__wheel-icon" style={{ width: '50%', height: '50%' }} />
              </div>
            </div>
            <div className="product-detail__thumbnails" role="list" aria-label="Color previews">
              {product.colors.map((color) => (
                <button
                  key={color}
                  role="listitem"
                  className={`product-detail__thumb${color === activeColor ? ' product-detail__thumb--active' : ''}`}
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
          </div>

          {/* Info */}
          <div className="product-detail__info">
            <p className="product-detail__model">Wheels · {product.model}</p>
            <h1 className="product-detail__name">{product.name}</h1>
            <p className="product-detail__price">{product.priceLabel}</p>

            {/* Color selector */}
            <div className="product-detail__color-selector">
              <p className="product-detail__option-title">
                Finish — <span style={{ color: 'var(--color-text-primary)', textTransform: 'none', letterSpacing: 0 }}>{activeColor}</span>
              </p>
              <div className="product-detail__colors" role="group" aria-label="Select finish">
                {product.colors.map((color) => (
                  <button
                    key={color}
                    className={`product-detail__color-btn${color === activeColor ? ' product-detail__color-btn--active' : ''}`}
                    onClick={() => handleColorSelect(color)}
                    aria-pressed={color === activeColor}
                    aria-label={color}
                  >
                    <span
                      className={`color-swatch color-swatch--${COLOR_CLASS[color]}`}
                      style={{ flexShrink: 0 }}
                    />
                    {color}
                  </button>
                ))}
              </div>
            </div>

            {/* Specs */}
            <div style={{ marginBottom: 'var(--space-8)' }}>
              <p className="product-detail__option-title">Specifications</p>
              <SpecList specs={specs} />
            </div>

            {/* Add to cart */}
            <Button
              variant="primary"
              size="large"
              className="product-detail__add-to-cart"
              onClick={handleAddToCart}
            >
              Request Quote
            </Button>
            <p className="product-detail__note">
              Checkout coming soon — submitting registers your interest.
            </p>

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
          <FitmentCallout source="product_page" />
        </div>
      </div>
    </div>
  );
}
