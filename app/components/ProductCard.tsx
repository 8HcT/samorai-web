import { Link } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import type { Product, ProductFinish, WheelColor } from '~/types/product';
import { getWidthsForFinish } from '~/data/products';
import { formatSize } from '~/lib/format';
import { ProductMedia, FINISH_SWATCH_CLASS as PLACEHOLDER_CLASS } from './ProductMedia';

interface ProductCardProps {
  product: Product;
  activeColor?: WheelColor;
  /**
   * Modo "modelo/color": renderiza la tarjeta para un acabado concreto y
   * enlaza a la ficha con ese acabado preseleccionado (`?finish=<id>`).
   */
  finish?: ProductFinish;
}

export function ProductCard({ product, activeColor, finish }: ProductCardProps) {
  // Hover largo (~3 s) → cambia a la imagen secundaria del acabado.
  const [showSecondary, setShowSecondary] = useState(false);
  const timer = useRef<number | null>(null);

  function clearTimer() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => clearTimer, []);

  function onEnter(images: string[]) {
    if (images.length < 2) return;
    clearTimer();
    timer.current = window.setTimeout(() => setShowSecondary(true), 3000);
  }
  function onLeave() {
    clearTimer();
    setShowSecondary(false);
  }

  // ── Tarjeta de acabado (uno de los "tres modelos") ──
  if (finish) {
    const sizes = getWidthsForFinish(product, finish.id).map((w) =>
      formatSize(18, w)
    );
    const src =
      showSecondary && finish.images[1] ? finish.images[1] : finish.images[0];
    return (
      <Link
        className="pcard"
        to={`/the-wheels/${product.slug}?finish=${finish.id}`}
        aria-label={`${product.model} — ${finish.name}`}
        onMouseEnter={() => onEnter(finish.images)}
        onMouseLeave={onLeave}
      >
        <div className="ph">
          <ProductMedia color={finish.color} src={src} alt={`${product.model} — ${finish.name}`} />
          {product.featured && (
            <div className="badges">
              <span className="badge badge-new">New</span>
            </div>
          )}
          <div className="ov">
            <span className="overlay-cta">Configurar →</span>
          </div>
        </div>

        <div className="body">
          <p className="coll">Wheels · {product.model}</p>
          <h3 className="nm">{finish.name}</h3>
          <div className="row">
            <span className="price">{product.priceLabel}</span>
            <span className="caption">{sizes.join(' · ')}</span>
          </div>
        </div>
      </Link>
    );
  }

  // ── Tarjeta de producto (comportamiento original) ──
  const displayColor = activeColor ?? product.colors[0];
  const placeholderClass = PLACEHOLDER_CLASS[displayColor];

  const sizes = Array.from(
    new Set(product.variants.map((v) => `${v.diameter}×${v.width}J`))
  ).slice(0, 4);

  return (
    <Link className="pcard" to={`/the-wheels/${product.slug}`}>
      <div className="ph">
        {/* Placeholder hasta tener fotografía real (PRD-XXA) */}
        <div className={`product-card__image-placeholder ${placeholderClass}`}>
          <div className="product-card__wheel-icon" aria-hidden="true" />
        </div>

        {product.featured && (
          <div className="badges">
            <span className="badge badge-new">New</span>
          </div>
        )}

        <div className="ov">
          <span className="overlay-cta">Ver ficha →</span>
        </div>
      </div>

      <div className="body">
        <p className="coll">Wheels · {product.specs.pcd}</p>
        <h3 className="nm">{product.model}</h3>
        <div className="row">
          <span className="price">{product.priceLabel}</span>
          <span className="caption">{sizes.join(' · ')}</span>
        </div>
      </div>
    </Link>
  );
}
