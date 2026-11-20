import { Link } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import type { Product, ProductFinish, WheelColor } from '~/types/product';
import { getWidthsForFinish } from '~/data/products';
import { formatSize } from '~/lib/format';
import { useLocale, useLocalePath, useT } from '~/i18n/useT';
import { ProductMedia, FINISH_SWATCH_CLASS as PLACEHOLDER_CLASS } from './ProductMedia';
import { PriceTag, PromoBadge } from './PriceTag';
import type { VariantPrice } from '~/lib/pricing';
import type { LabelCode } from '~/lib/catalog';

interface ProductCardProps {
  product: Product;
  activeColor?: WheelColor;
  /**
   * Modo "modelo/color": renderiza la tarjeta para un acabado concreto y
   * enlaza a la ficha con ese acabado preseleccionado (`?finish=<id>`).
   */
  finish?: ProductFinish;
  /** Precio más bajo vigente (con promoción si la hay). Sin él, `priceLabel`. */
  price?: VariantPrice | null;
  /** Etiquetas del acabado (las del panel y las automáticas de stock). */
  labels?: LabelCode[];
}

/** Clase de cada etiqueta: la del panel en dorado; las de stock, aparte. */
export const LABEL_CLASS: Record<LabelCode, string> = {
  new: 'badge-new',
  premium: 'badge-new',
  best_seller: 'badge-new',
  limited: 'badge-new',
  exclusive: 'badge-new',
  back_in_stock: 'badge-new',
  last_units: 'badge-low',
  sold_out: 'badge-soldout',
};

export function ProductCard({ product, activeColor, finish, price, labels = [] }: ProductCardProps) {
  // Hover largo (~3 s) → cambia a la imagen secundaria del acabado.
  const [showSecondary, setShowSecondary] = useState(false);
  const timer = useRef<number | null>(null);
  const lp = useLocalePath();
  const t = useT();
  const locale = useLocale();
  const finishName = (f: ProductFinish) => t.finishNames[f.id] ?? f.name;

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
      formatSize(18, w, locale)
    );
    const src =
      showSecondary && finish.images[1] ? finish.images[1] : finish.images[0];
    const soldOut = labels.includes('sold_out');
    return (
      <Link prefetch="intent"
        className={`pcard${soldOut ? ' pcard--soldout' : ''}`}
        to={lp(`/the-wheels/${product.slug}?finish=${finish.id}`)}
        aria-label={`${product.model} — ${finishName(finish)}`}
        onMouseEnter={() => onEnter(finish.images)}
        onMouseLeave={onLeave}
      >
        <div className="ph">
          <ProductMedia color={finish.color} src={src} alt={`${product.model} — ${finishName(finish)}`} />
          {/* Etiquetas del panel, de stock y la de la promoción activa (automáticas). */}
          {(labels.length > 0 || (price?.promotion && !soldOut)) && (
            <div className="badges">
              {labels.map((code) => (
                <span key={code} className={`badge ${LABEL_CLASS[code]}`}>{t.labels[code]}</span>
              ))}
              {price?.promotion && !soldOut && <PromoBadge promotion={price.promotion} />}
            </div>
          )}
          <div className="ov">
            <span className="overlay-cta">{t.wheels.configure}</span>
          </div>
        </div>

        <div className="body">
          <p className="coll">{t.product.collection} · {product.model}</p>
          <h3 className="nm">{finishName(finish)}</h3>
          <div className="row">
            {price ? (
              <PriceTag price={price} prefix={t.product.from} wasLabel={t.product.was} className="price" />
            ) : (
              <span className="price">{product.priceLabel}</span>
            )}
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
    <Link prefetch="intent" className="pcard" to={lp(`/the-wheels/${product.slug}`)}>
      <div className="ph">
        {/* Placeholder hasta tener fotografía real (PRD-XXA) */}
        <div className={`product-card__image-placeholder ${placeholderClass}`}>
          <div className="product-card__wheel-icon" aria-hidden="true" />
        </div>

        <div className="ov">
          <span className="overlay-cta">{t.wheels.viewProduct}</span>
        </div>
      </div>

      <div className="body">
        <p className="coll">{t.product.collection} · {product.specs.pcd}</p>
        <h3 className="nm">{product.model}</h3>
        <div className="row">
          <span className="price">{product.priceLabel}</span>
          <span className="caption">{sizes.join(' · ')}</span>
        </div>
      </div>
    </Link>
  );
}
