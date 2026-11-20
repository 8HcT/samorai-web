import { Skeleton, SkeletonText } from '~/components/ui/Skeleton';
import { useCart } from '~/lib/cart/CartContext';

/**
 * Esqueletos de las páginas públicas. Se enseñan mientras llega la página a
 * la que se va (cambio de página lento) y reproducen su forma para que el
 * salto sea mínimo. Son decorativos: quien los usa anuncia la carga.
 */

function HeroBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`page-skel-hero${compact ? ' page-skel-hero--compact' : ''}`} aria-hidden="true">
      <div className="container">
        <Skeleton width={110} height={12} />
        <Skeleton width="min(560px, 80%)" height={compact ? 40 : 56} />
        <Skeleton width="min(420px, 65%)" height={14} />
      </div>
    </div>
  );
}

function ProductDetailSkeleton() {
  return (
    <div className="section">
      <div className="container">
        <div className="product-detail" aria-hidden="true">
          <div className="page-skel-gallery">
            {/* Acabados a la izquierda, foto y miniaturas a la derecha (como la ficha) */}
            <div className="page-skel-swatches">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width="100%" height="auto" radius="50%" style={{ aspectRatio: '1 / 1' }} />
              ))}
            </div>
            <div className="page-skel-stack page-skel-stack--tight">
              <Skeleton width="100%" height="auto" style={{ aspectRatio: '1 / 1' }} />
              <div className="page-skel-thumbs">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} width="100%" height="auto" style={{ aspectRatio: '1 / 1' }} />
                ))}
              </div>
            </div>
          </div>
          <div className="product-detail__info page-skel-stack">
            <Skeleton width="34%" height={12} />
            <Skeleton width="58%" height={40} />
            <Skeleton width="36%" height={24} />
            <Skeleton width="52%" height={12} />
            {[170, 84].map((chip, g) => (
              <div key={g} className="page-skel-stack page-skel-stack--tight">
                <Skeleton width="30%" height={14} />
                <div className="page-skel-row">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} width={chip} height={40} />
                  ))}
                </div>
              </div>
            ))}
            <Skeleton width="45%" height={16} />
            <div className="page-skel-row" style={{ flexWrap: 'nowrap' }}>
              <Skeleton width={112} height={50} style={{ flex: 'none' }} />
              <Skeleton width="100%" height={50} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WheelsSkeleton() {
  return (
    <>
      {/* Como en la página real: en móvil no hay cabecera con foto. */}
      <div className="page-skel-desktop-only">
        <HeroBlock compact />
      </div>
      <div className="section">
        <div className="container">
          <div className="product-grid product-grid--models" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="page-skel-stack">
                <Skeleton width="100%" height="auto" style={{ aspectRatio: '1 / 1' }} />
                <Skeleton width="45%" height={12} />
                <Skeleton width="65%" height={22} />
                <Skeleton width="35%" height={16} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** Forma del carrito (también la usa el propio carrito antes de hidratar). */
export function CartSkeletonBody({ items = 2 }: { items?: number }) {
  return (
    <div className="cart-layout" aria-hidden="true">
      <div>
        {Array.from({ length: items }, (_, i) => (
          <div key={i} className="cart-item">
            <div className="cart-item__image"><Skeleton width="100%" height="100%" /></div>
            <div style={{ display: 'grid', gap: 10 }}>
              <Skeleton width="45%" height={18} />
              <SkeletonText lines={2} />
              <Skeleton width={120} height={36} />
            </div>
            <div className="cart-item__price"><Skeleton width={80} height={20} /></div>
          </div>
        ))}
      </div>
      <div className="cart-summary">
        <Skeleton width="50%" height={20} />
        <div style={{ display: 'grid', gap: 14, margin: '24px 0' }}>
          <SkeletonText lines={3} />
        </div>
        <Skeleton width="100%" height={52} />
      </div>
    </div>
  );
}

/** `items`: líneas que ya sabemos que tiene el carrito (vive en el navegador). */
function CartSkeleton({ items }: { items: number }) {
  if (items === 0) {
    return (
      <div className="section">
        <div className="container">
          <div className="page-skel-empty" aria-hidden="true">
            <Skeleton width={40} height={40} radius="50%" />
            <Skeleton width="min(320px, 80%)" height={26} />
            <Skeleton width="min(380px, 90%)" height={14} />
            <Skeleton width={210} height={46} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="section">
      <div className="container">
        <div className="page-skel-stack page-skel-stack--tight" style={{ marginBottom: 'var(--space-10)' }} aria-hidden="true">
          <Skeleton width={90} height={12} />
          <Skeleton width="min(320px, 70%)" height={40} />
        </div>
        <CartSkeletonBody items={Math.min(items, 3)} />
      </div>
    </div>
  );
}

/** Páginas con foto de cabecera y texto (The Dynasty, distribuidores, legales). */
function HeroTextSkeleton() {
  return (
    <>
      <HeroBlock compact />
      <div className="section">
        <div className="container page-skel-stack" style={{ maxWidth: 760 }} aria-hidden="true">
          <Skeleton width="55%" height={28} />
          <SkeletonText lines={4} />
          <SkeletonText lines={3} />
          <Skeleton width="40%" height={22} />
          <SkeletonText lines={4} />
        </div>
      </div>
    </>
  );
}

/** Resto (contacto, cuenta, pedido…): título de sección y un bloque de contenido. */
function SectionSkeleton() {
  return (
    <div className="section">
      <div className="container page-skel-stack" aria-hidden="true">
        <div className="page-skel-stack page-skel-stack--tight">
          <Skeleton width={150} height={12} />
          <Skeleton width="min(380px, 75%)" height={30} />
          <Skeleton width="min(620px, 90%)" height={16} />
        </div>
        <div className="page-skel-card">
          {[0, 1, 2].map((i) => (
            <div key={i} className="page-skel-stack page-skel-stack--tight">
              <Skeleton width={90} height={11} />
              <Skeleton width="100%" height={38} />
            </div>
          ))}
          <Skeleton width="100%" height={46} />
        </div>
      </div>
    </div>
  );
}

/** Esqueleto de la página pública que corresponde a `path`. */
export function PageSkeleton({ path, cartItems = 2 }: { path: string; cartItems?: number }) {
  const p = path.replace(/^\/en(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  if (/^\/(the-wheels|wheels|product)\/[^/]+$/.test(p)) return <ProductDetailSkeleton />;
  if (p === '/the-wheels' || p === '/wheels' || p === '/shop') return <WheelsSkeleton />;
  if (p === '/cart') return <CartSkeleton items={cartItems} />;
  if (p === '/') return <HeroBlock />;
  if (/^\/(the-dynasty|the-dealers|dealers|legal|privacidad|cookies)$/.test(p)) return <HeroTextSkeleton />;
  return <SectionSkeleton />;
}

/**
 * Capa de carga entre páginas: va dentro del CartProvider para saber cómo es
 * el carrito antes de llegar a él (vacío o con N líneas).
 */
export function PageLoadingOverlay({ path, label }: { path: string; label: string }) {
  const { lines, ready } = useCart();
  return (
    <div className="page-loading" role="status" aria-label={label}>
      <PageSkeleton path={path} cartItems={ready ? lines.length : 2} />
    </div>
  );
}
