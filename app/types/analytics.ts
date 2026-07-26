export type AnalyticsEventName =
  | 'page_view'
  | 'wheels_page_viewed'
  | 'product_viewed'
  | 'product_variant_selected'
  | 'color_selected'
  | 'finish_selected'
  | 'configure_clicked'
  | 'configurator_opened'
  | 'config_size_selected'
  | 'config_et_selected'
  | 'size_selected'
  | 'gallery_viewed'
  | 'technology_page_viewed'
  | 'fitment_page_viewed'
  | 'dealer_page_viewed'
  | 'support_page_viewed'
  | 'hub_rings_interest_clicked'
  | 'add_to_cart_clicked'
  | 'cart_viewed'
  | 'checkout_started'
  | 'language_selected'
  | 'newsletter_signup_attempted';

export interface AnalyticsEventPayloads {
  page_view:                 { path: string; title: string };
  wheels_page_viewed:        Record<string, never>;
  product_viewed:            { productId: string; productName: string; slug: string };
  product_variant_selected:  { productId: string; variantId: string };
  color_selected:            { productId: string; color: string };
  finish_selected:           { productId: string; finishId: string };
  configure_clicked:         { productId: string; finishId: string };
  configurator_opened:       { productId: string; finishId: string };
  config_size_selected:      { productId: string; finishId: string; width: number };
  config_et_selected:        { productId: string; finishId: string; et: number };
  size_selected:             { productId: string; size: string };
  gallery_viewed:            { category?: string };
  technology_page_viewed:    Record<string, never>;
  fitment_page_viewed:       Record<string, never>;
  dealer_page_viewed:        Record<string, never>;
  support_page_viewed:       Record<string, never>;
  hub_rings_interest_clicked: { source: string };
  add_to_cart_clicked:       { productId: string; variantId: string; quantity: number };
  cart_viewed:               { itemCount: number };
  checkout_started:          { itemCount: number };
  language_selected:         { language: string };
  newsletter_signup_attempted: Record<string, never>;
}

export type AnalyticsEvent<T extends AnalyticsEventName = AnalyticsEventName> = {
  event: T;
  payload: AnalyticsEventPayloads[T];
  timestamp: string;
};
