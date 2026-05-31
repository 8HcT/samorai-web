export type WheelColor =
  | 'Anthracite Grey'
  | 'Black Metallic'
  | 'Silver Metallic'
  | 'Raw Aluminum';

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'pre_order';

export type ProductStatus = 'active' | 'sample' | 'discontinued' | 'coming_soon';

export type ProductCategory = 'wheel' | 'hub_ring' | 'accessory';

export interface WheelVariant {
  id: string;
  diameter: number;
  width: number;
  et: number;
  pcd: string;
  cb: number;
  color: WheelColor;
  vehicleFitment: string[];
  maxLoad: number;
  capLogo: string;
  stockStatus: StockStatus;
  priceLabel: string;
}

export interface WheelSpecs {
  pcd: string;
  cbBase: number;
  maxLoad: number;
  capLogo: string;
  material: string;
  finish: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  model: string;
  category: ProductCategory;
  status: ProductStatus;
  priceLabel: string;
  description: string;
  shortDescription: string;
  colors: WheelColor[];
  variants: WheelVariant[];
  specs: WheelSpecs;
  imagePlaceholder: string;
  featured: boolean;
}

export interface HubRingOption {
  id: string;
  wheelCB: number;
  vehicleCB: number;
  material: 'aluminum' | 'plastic' | 'billet_aluminum';
  hasLogo: boolean;
  quantity: number;
  compatibilityNotes: string;
  priceLabel: string;
  stockStatus: StockStatus;
}

export interface HubRingProduct {
  id: string;
  slug: string;
  name: string;
  category: 'hub_ring';
  status: ProductStatus;
  description: string;
  shortDescription: string;
  options: HubRingOption[];
  featured: boolean;
  comingSoon: boolean;
}
