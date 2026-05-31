import type { Route } from './+types/gallery';
import { useEffect, useState } from 'react';
import { trackEvent } from '~/lib/analytics/trackEvent';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Gallery — SAMORAI Wheels' },
    { name: 'description', content: 'SAMORAI wheel gallery — vehicles, studio shots, detail photography and wheel finishes.' },
  ];
}

type GalleryCategory = 'all' | 'vehicles' | 'wheels' | 'details' | 'studio';

const CATEGORIES: { key: GalleryCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'wheels', label: 'Wheels' },
  { key: 'details', label: 'Details' },
  { key: 'studio', label: 'Studio' },
];

interface GalleryItem {
  id: string;
  category: Exclude<GalleryCategory, 'all'>;
  title: string;
  subtitle?: string;
  placeholderClass: string;
  landscape?: boolean;
  showWheelIcon?: boolean;
}

const GALLERY_ITEMS: GalleryItem[] = [
  { id: 'v1', category: 'vehicles', title: 'Victoria — Anthracite Grey', subtitle: 'Vehicle fitment', placeholderClass: 'gallery-placeholder--vehicle-1', landscape: true },
  { id: 'v2', category: 'vehicles', title: 'Studio Setup', subtitle: 'Pre-shoot', placeholderClass: 'gallery-placeholder--vehicle-2' },
  { id: 'v3', category: 'vehicles', title: 'Wheel Detail', subtitle: 'On vehicle', placeholderClass: 'gallery-placeholder--detail-1' },
  { id: 'v4', category: 'vehicles', title: '3/4 Front', subtitle: 'Studio', placeholderClass: 'gallery-placeholder--vehicle-3', landscape: true },
  { id: 'v5', category: 'vehicles', title: 'Side Profile', subtitle: 'Daylight', placeholderClass: 'gallery-placeholder--vehicle-4' },
  { id: 'w1', category: 'wheels', title: 'Victoria — Anthracite Grey', subtitle: '18×9 ET35', placeholderClass: 'gallery-placeholder--wheel-ag', showWheelIcon: true },
  { id: 'w2', category: 'wheels', title: 'Victoria — Black Metallic', subtitle: '18×9.5 ET45', placeholderClass: 'gallery-placeholder--wheel-bm', showWheelIcon: true },
  { id: 'w3', category: 'wheels', title: 'Victoria — Silver Metallic', subtitle: '18×9 ET35', placeholderClass: 'gallery-placeholder--wheel-sm', showWheelIcon: true },
  { id: 'w4', category: 'wheels', title: 'Victoria — Face Shot', subtitle: 'All finishes', placeholderClass: 'gallery-placeholder--detail-2', showWheelIcon: true, landscape: true },
  { id: 'd1', category: 'details', title: 'Spoke Profile', subtitle: 'Macro', placeholderClass: 'gallery-placeholder--detail-1' },
  { id: 'd2', category: 'details', title: 'Hub Bore Detail', subtitle: 'CB 72.6mm', placeholderClass: 'gallery-placeholder--detail-2' },
  { id: 'd3', category: 'details', title: 'Finish Close-up', subtitle: 'Anthracite Grey', placeholderClass: 'gallery-placeholder--wheel-ag', landscape: true },
  { id: 's1', category: 'studio', title: 'Studio — Overhead', subtitle: 'Clean background', placeholderClass: 'gallery-placeholder--studio-1', showWheelIcon: true },
  { id: 's2', category: 'studio', title: 'Studio — Profile', subtitle: 'Side view', placeholderClass: 'gallery-placeholder--studio-2', showWheelIcon: true },
  { id: 's3', category: 'studio', title: 'Studio — Trio', subtitle: 'All three finishes', placeholderClass: 'gallery-placeholder--studio-3', landscape: true },
];

export default function Gallery() {
  const [activeCategory, setActiveCategory] = useState<GalleryCategory>('all');

  useEffect(() => {
    trackEvent('gallery_viewed', {});
  }, []);

  function handleCategoryChange(cat: GalleryCategory) {
    setActiveCategory(cat);
    if (cat !== 'all') {
      trackEvent('gallery_viewed', { category: cat });
    }
  }

  const filtered = activeCategory === 'all'
    ? GALLERY_ITEMS
    : GALLERY_ITEMS.filter((item) => item.category === activeCategory);

  return (
    <>
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow">Visual Archive</span>
          <h1>Gallery</h1>
          <p className="page-hero__subtitle">
            Vehicle fitments, studio shots, finish details and wheel photography.
            All images are placeholders — production photography coming soon.
          </p>
        </div>
      </div>

      <div className="section">
        <div className="container">
          <div className="filter-bar" role="group" aria-label="Filter gallery by category">
            <span className="filter-bar__label">Category:</span>
            {CATEGORIES.map(({ key, label }) => (
              <button
                key={key}
                className={`filter-chip${activeCategory === key ? ' filter-chip--active' : ''}`}
                onClick={() => handleCategoryChange(key)}
                aria-pressed={activeCategory === key}
              >
                {label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon" aria-hidden="true">○</div>
              <h3>Nothing here yet</h3>
              <p>Photography for this category is coming soon.</p>
            </div>
          ) : (
            <div className="gallery-grid">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className={`gallery-card${item.landscape ? ' gallery-card--landscape' : ''}`}
                  aria-label={item.title}
                >
                  <div className={`gallery-card__placeholder ${item.placeholderClass}`}>
                    {item.showWheelIcon && (
                      <div className="gallery-card__wheel-icon" aria-hidden="true" />
                    )}
                  </div>
                  <div className="gallery-card__meta">
                    <p className="gallery-card__category">{item.category}</p>
                    <p className="gallery-card__title">{item.title}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p
            style={{
              marginTop: 'var(--space-10)',
              textAlign: 'center',
              fontSize: 'var(--text-xs)',
              letterSpacing: 'var(--tracking-widest)',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
            }}
          >
            Production photography in progress — all images are CSS placeholders
          </p>
        </div>
      </div>
    </>
  );
}
