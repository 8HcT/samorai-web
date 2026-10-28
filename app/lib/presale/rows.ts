/**
 * Formas de las filas de la base de datos (supabase/migrations) que se leen
 * desde el servidor. Solo tipos.
 */
import type { BatchStatus, DepositStatus, OrderStatus, ReservationStatus } from './types';

export interface BatchRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: BatchStatus;
  capacity_sets: number;
  units_per_set: number;
  max_sets_per_order: number;
  presale_opens_at: string | null;
  presale_closes_at: string | null;
  planned_launch_at: string | null;
  launched_at: string | null;
  estimated_delivery_on: string | null;
  estimated_delivery_note: string | null;
  deposit_cents: number;
  presale_discount_enabled: boolean;
  presale_discount_bps: number;
  balance_window_days: number;
  first_reminder_day: number;
  final_reminder_day: number;
  expiry_deposit_policy: 'manual_review' | 'refund' | 'retain';
  policies_legally_validated: boolean;
  reservation_terms: string | null;
  cancellation_policy: string | null;
  refund_policy: string | null;
  expiry_policy: string | null;
  created_at: string;
  updated_at: string;
}

export interface TermsSnapshot {
  batch_code?: string;
  batch_name?: string;
  reservation_terms?: string | null;
  cancellation_policy?: string | null;
  refund_policy?: string | null;
  expiry_policy?: string | null;
  expiry_deposit_policy?: string;
  policies_legally_validated?: boolean;
  balance_window_days?: number;
  deposit_cents_per_set?: number;
  discount_bps?: number;
  planned_launch_at?: string | null;
  estimated_delivery_on?: string | null;
  estimated_delivery_note?: string | null;
}

export interface ReservationRow {
  id: string;
  code: string;
  batch_id: string;
  user_id: string | null;
  email: string | null;
  customer_name: string | null;
  phone: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  product_slug: string;
  product_name: string;
  variant_id: string;
  finish_id: string;
  finish_name: string;
  diameter: number | string;
  width: number | string;
  et: number;
  pcd: string;
  center_bore: number | string;
  config_snapshot: Record<string, unknown>;
  quantity_sets: number;
  units_per_set: number;
  currency: string;
  unit_price_cents: number;
  subtotal_cents: number;
  discount_bps: number;
  discount_cents: number;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
  terms_snapshot: TermsSnapshot;
  terms_accepted_at: string;
  status: ReservationStatus;
  deposit_status: DepositStatus;
  deposit_paid_at: string | null;
  balance_due_at: string | null;
  balance_paid_at: string | null;
  expired_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  review_reason: string | null;
  config_review_status: 'pending' | 'approved' | 'rejected';
  config_review_note: string | null;
  stripe_deposit_session_id: string | null;
  stripe_deposit_payment_intent_id: string | null;
  stripe_balance_session_id: string | null;
  stripe_balance_payment_intent_id: string | null;
  order_id: string | null;
  access_version: number;
  locale: string;
  created_at: string;
  updated_at: string;
}

export interface AddressJson {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface OrderRow {
  id: string;
  code: string | null;
  kind: 'cart' | 'direct' | 'presale';
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  amount_total_cents: number | null;
  subtotal_cents: number | null;
  discount_cents: number;
  amount_paid_cents: number | null;
  refunded_cents: number;
  currency: string;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  shipping_address: AddressJson | null;
  billing_address: AddressJson | null;
  payment_status: string;
  status: OrderStatus;
  user_id: string | null;
  reservation_id: string | null;
  batch_id: string | null;
  review_reason: string | null;
  carrier: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  access_version: number;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  variant_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  finish_id: string | null;
  finish_name: string | null;
  diameter: number | string | null;
  width: number | string | null;
  et: number | null;
  sets: number | null;
}

export interface PaymentRow {
  id: string;
  purpose: 'deposit' | 'balance' | 'direct';
  reservation_id: string | null;
  order_id: string | null;
  allocation_id: string | null;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  status: 'open' | 'processing' | 'succeeded' | 'failed' | 'expired' | 'refunded' | 'partially_refunded';
  refunded_cents: number;
  checkout_expires_at: string | null;
  paid_at: string | null;
  livemode: boolean | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  template: string;
  dedupe_key: string;
  audience: 'customer' | 'shop';
  to_email: string | null;
  reservation_id: string | null;
  order_id: string | null;
  batch_id: string | null;
  is_bulk: boolean;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'held' | 'cancelled';
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  provider_message_id: string | null;
  payload: Record<string, unknown>;
  sent_at: string | null;
  created_at: string;
}

export interface AuditRow {
  id: number;
  entity_type: string;
  entity_id: string | null;
  action: string;
  actor_type: string;
  actor_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

/** Contexto que devuelve `notification_context(p_id)`. */
export interface NotificationContext {
  notification: NotificationRow;
  reservation: ReservationRow | null;
  order: OrderRow | null;
  order_items: OrderItemRow[];
  batch: BatchRow | null;
  payments: PaymentRow[];
}
