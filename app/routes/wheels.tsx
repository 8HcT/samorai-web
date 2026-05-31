import type { Route } from './+types/wheels';
import { useEffect, useState } from 'react';
import { products } from '~/data/products';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { SectionHeader } from '~/components/SectionHeader';
import { ProductGrid } from '~/components/ProductGrid';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Wheels — SAMORAI' },
    { name: 'description', content: 'Browse the SAMORAI Victoria wheel range. Available in multiple sizes, offsets and premium finishes. Verify fitment for your vehicle.' },
  ];
}

export function loader() {
  return { products };
}

type FilterKey = 'all' | '5x120' | '18';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: '5x120', label: '5×120 PCD' },
  { key: '18', label: '18″' },
];

export default function Wheels({ loaderData }: Route.ComponentProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  useEffect(() => {
    trackEvent('wheels_page_viewed', {});
  }, []);

  const filtered = loaderData.products.filter((p) => {
    if (p.status !== 'active') return false;
    if (activeFilter === '5x120') return p.specs.pcd === '5x120';
    if (activeFilter === '18') return p.variants.some((v) => v.diameter === 18);
    return true;
  });

  return (
    <>
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow">Collection</span>
          <h1>Wheels</h1>
          <p className="page-hero__subtitle">
            Premium alloy wheels, precision engineered. Verify fitment for your specific vehicle before ordering.
          </p>
        </div>
      </div>

      <div className="section">
        <div className="container">
          <div className="filter-bar" role="group" aria-label="Filter products">
            <span className="filter-bar__label">Filter:</span>
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                className={`filter-chip${activeFilter === key ? ' filter-chip--active' : ''}`}
                onClick={() => setActiveFilter(key)}
                aria-pressed={activeFilter === key}
              >
                {label}
              </button>
            ))}
          </div>

          <ProductGrid
            products={filtered}
            emptyMessage="No products match your selection."
          />
        </div>
      </div>
    </>
  );
}
