import type { Product, HubRingProduct } from '~/types/product';

export const products: Product[] = [
  {
    id: 'victoria-001',
    slug: 'victoria',
    name: 'SAMORAI Victoria',
    model: 'Victoria',
    category: 'wheel',
    status: 'active',
    priceLabel: 'Price on request',
    shortDescription: 'Precision-engineered alloy wheel designed for BMW platforms. Five-spoke architecture with motorsport-grade geometry.',
    description: 'The Victoria is the first commercial wheel from SAMORAI — a statement of what precision engineering looks like when driven by a passion for automotive performance. Designed around BMW fitment standards with 5x120 PCD and a 72.6mm center bore, the Victoria delivers exact OEM tolerances with an aesthetic that elevates any build. Available in three finishes: Anthracite Grey, Black Metallic, and Silver Metallic.',
    colors: ['Anthracite Grey', 'Black Metallic', 'Silver Metallic'],
    specs: {
      pcd: '5x120',
      cbBase: 72.6,
      maxLoad: 650,
      capLogo: 'SAMORAI Logo',
      material: 'Cast aluminum alloy',
      finish: 'Multi-coat powder',
    },
    imagePlaceholder: '/images/victoria-placeholder.jpg',
    featured: true,
    variants: [
      /* — Anthracite Grey — */
      {
        id: 'vic-18x85-et35-ag',
        diameter: 18, width: 8.5, et: 35, pcd: '5x120', cb: 72.6,
        color: 'Anthracite Grey', vehicleFitment: ['BMW 3 Series (E90/F30)', 'BMW 4 Series (F32)'],
        maxLoad: 650, capLogo: 'SAMORAI Logo', stockStatus: 'in_stock', priceLabel: 'Price on request',
      },
      {
        id: 'vic-18x9-et35-ag',
        diameter: 18, width: 9, et: 35, pcd: '5x120', cb: 72.6,
        color: 'Anthracite Grey', vehicleFitment: ['BMW 3 Series (E90/F30)', 'BMW 5 Series (F10)'],
        maxLoad: 650, capLogo: 'SAMORAI Logo', stockStatus: 'in_stock', priceLabel: 'Price on request',
      },
      {
        id: 'vic-18x9-et45-ag',
        diameter: 18, width: 9, et: 45, pcd: '5x120', cb: 72.6,
        color: 'Anthracite Grey', vehicleFitment: ['BMW 5 Series (F10)', 'BMW 6 Series (F13)'],
        maxLoad: 650, capLogo: 'SAMORAI Logo', stockStatus: 'low_stock', priceLabel: 'Price on request',
      },
      {
        id: 'vic-18x95-et45-ag',
        diameter: 18, width: 9.5, et: 45, pcd: '5x120', cb: 72.6,
        color: 'Anthracite Grey', vehicleFitment: ['BMW 5 Series (F10)', 'BMW M3/M4'],
        maxLoad: 650, capLogo: 'SAMORAI Logo', stockStatus: 'pre_order', priceLabel: 'Price on request',
      },
      /* — Black Metallic — */
      {
        id: 'vic-18x85-et35-bm',
        diameter: 18, width: 8.5, et: 35, pcd: '5x120', cb: 72.6,
        color: 'Black Metallic', vehicleFitment: ['BMW 3 Series (E90/F30)', 'BMW 4 Series (F32)'],
        maxLoad: 650, capLogo: 'SAMORAI Logo', stockStatus: 'in_stock', priceLabel: 'Price on request',
      },
      {
        id: 'vic-18x9-et35-bm',
        diameter: 18, width: 9, et: 35, pcd: '5x120', cb: 72.6,
        color: 'Black Metallic', vehicleFitment: ['BMW 3 Series (E90/F30)', 'BMW 5 Series (F10)'],
        maxLoad: 650, capLogo: 'SAMORAI Logo', stockStatus: 'in_stock', priceLabel: 'Price on request',
      },
      {
        id: 'vic-18x9-et45-bm',
        diameter: 18, width: 9, et: 45, pcd: '5x120', cb: 72.6,
        color: 'Black Metallic', vehicleFitment: ['BMW 5 Series (F10)', 'BMW 6 Series (F13)'],
        maxLoad: 650, capLogo: 'SAMORAI Logo', stockStatus: 'in_stock', priceLabel: 'Price on request',
      },
      {
        id: 'vic-18x95-et45-bm',
        diameter: 18, width: 9.5, et: 45, pcd: '5x120', cb: 72.6,
        color: 'Black Metallic', vehicleFitment: ['BMW 5 Series (F10)', 'BMW M3/M4'],
        maxLoad: 650, capLogo: 'SAMORAI Logo', stockStatus: 'out_of_stock', priceLabel: 'Price on request',
      },
      /* — Silver Metallic — */
      {
        id: 'vic-18x85-et45-sm',
        diameter: 18, width: 8.5, et: 45, pcd: '5x120', cb: 72.6,
        color: 'Silver Metallic', vehicleFitment: ['BMW 3 Series (E90/F30)'],
        maxLoad: 650, capLogo: 'SAMORAI Logo', stockStatus: 'in_stock', priceLabel: 'Price on request',
      },
      {
        id: 'vic-18x9-et35-sm',
        diameter: 18, width: 9, et: 35, pcd: '5x120', cb: 72.6,
        color: 'Silver Metallic', vehicleFitment: ['BMW 3 Series (E90/F30)', 'BMW 5 Series (F10)'],
        maxLoad: 650, capLogo: 'SAMORAI Logo', stockStatus: 'low_stock', priceLabel: 'Price on request',
      },
      /* — Test Samples (not featured) — */
      {
        id: 'sample-18x85-et35-ra',
        diameter: 18, width: 8.5, et: 35, pcd: '5x112', cb: 73.1,
        color: 'Raw Aluminum', vehicleFitment: ['Development / Sample only'],
        maxLoad: 650, capLogo: 'None', stockStatus: 'out_of_stock', priceLabel: 'Not for sale',
      },
      {
        id: 'sample-18x9-et45-ra',
        diameter: 18, width: 9, et: 45, pcd: '5x112', cb: 73.1,
        color: 'Raw Aluminum', vehicleFitment: ['Development / Sample only'],
        maxLoad: 650, capLogo: 'None', stockStatus: 'out_of_stock', priceLabel: 'Not for sale',
      },
      {
        id: 'sample-18x95-et45-ra',
        diameter: 18, width: 9.5, et: 45, pcd: '5x112', cb: 73.1,
        color: 'Raw Aluminum', vehicleFitment: ['Development / Sample only'],
        maxLoad: 650, capLogo: 'None', stockStatus: 'out_of_stock', priceLabel: 'Not for sale',
      },
    ],
  },
];

export const hubRingProduct: HubRingProduct = {
  id: 'hub-ring-samorai-001',
  slug: 'samorai-hub-rings',
  name: 'SAMORAI Custom Hub Rings',
  category: 'hub_ring',
  status: 'coming_soon',
  shortDescription: 'Custom-machined hub rings to perfectly adapt SAMORAI wheels to your vehicle\'s center bore. Logo-engraved, precision-fitted.',
  description: 'Every SAMORAI wheel ships with a base center bore of 72.6mm. If your vehicle requires a different CB, our precision-machined hub rings eliminate vibration and ensure the wheel sits concentrically on the hub — just as it would from the factory. Select your wheel CB and vehicle CB, and we machine your hub rings to exact tolerances. Available in billet aluminum with optional SAMORAI logo engraving.',
  featured: true,
  comingSoon: true,
  options: [
    {
      id: 'hr-726-571',
      wheelCB: 72.6, vehicleCB: 57.1,
      material: 'billet_aluminum', hasLogo: true,
      quantity: 4, compatibilityNotes: 'BMW to Volkswagen/Audi adaptation',
      priceLabel: 'Coming soon', stockStatus: 'pre_order',
    },
    {
      id: 'hr-726-651',
      wheelCB: 72.6, vehicleCB: 65.1,
      material: 'billet_aluminum', hasLogo: true,
      quantity: 4, compatibilityNotes: 'Various European applications',
      priceLabel: 'Coming soon', stockStatus: 'pre_order',
    },
    {
      id: 'hr-726-669',
      wheelCB: 72.6, vehicleCB: 66.9,
      material: 'billet_aluminum', hasLogo: true,
      quantity: 4, compatibilityNotes: 'Various Ford/Opel applications',
      priceLabel: 'Coming soon', stockStatus: 'pre_order',
    },
  ],
};

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getFeaturedProducts(): Product[] {
  return products.filter((p) => p.featured && p.status === 'active');
}

export function getVariantsByColor(product: Product, color: string) {
  return product.variants.filter(
    (v) => v.color === color && v.stockStatus !== 'out_of_stock'
  );
}
