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
  /** Identificador estable del acabado (no depende del texto visible). */
  finishId: string;
  diameter: number;
  width: number;
  et: number;
  pcd: string;
  cb: number;
  color: WheelColor;
  vehicleFitment: string[];
  maxLoad: number;
  capLogo: string;
  /**
   * Valor técnico adicional de la tabla original (significado sin
   * confirmar — NO renombrar como carga, peso, concavidad, etc.).
   */
  technicalValue: number;
  stockStatus: StockStatus;
  priceLabel: string;
  /**
   * Precio unitario FINAL en céntimos de EUR (IVA incluido). El importe
   * depende exclusivamente del ancho (ver ~/lib/pricing). Es la fuente de
   * verdad del servidor; el frontend nunca decide cuánto se cobra.
   */
  priceCents?: number;
  /** IDs reales de Stripe — se rellenan cuando el cliente los facilite. */
  stripeProductId?: string;
  stripePriceId?: string;
}

/** Acabado disponible de un producto. El nombre visible puede cambiar. */
export interface ProductFinish {
  id: string;
  name: string;
  /** Color base para el swatch/placeholder mientras no hay fotos reales. */
  color: WheelColor;
  /**
   * Imágenes del acabado (rutas en public/images/). La primera es la
   * PRINCIPAL; la segunda, la secundaria (hover del card); el resto, extras
   * para la galería (zooms / perspectivas). Al menos 2 por referencia.
   */
  images: string[];
}

export interface WheelSpecs {
  pcd: string;
  cbBase: number;
  maxLoad: number;
  capLogo: string;
  material: string;
  /** Proceso de fabricación (p. ej. FlowForming). */
  process: string;
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
  /** Acabados disponibles (fuente de verdad de id ↔ nombre visible). */
  finishes: ProductFinish[];
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
