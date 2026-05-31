import type { Product } from '~/types/product';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: Product[];
  emptyMessage?: string;
}

export function ProductGrid({ products, emptyMessage = 'No products found.' }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon" aria-hidden="true">○</div>
        <h3>Nothing here yet</h3>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
