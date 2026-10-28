/**
 * Panel «Mi cuenta» (solo servidor).
 *
 * Las LECTURAS se hacen con el cliente del propio usuario (clave pública +
 * su sesión): Row Level Security garantiza que solo ve sus filas, aunque
 * hubiera un fallo en este código. Las vinculaciones de compras de invitado
 * pasan por una función SQL que exige email verificado.
 */
import type { User } from '@supabase/supabase-js';
import type { AuthContext } from '~/lib/auth/session.server';
import { adminRpc } from './rpc.server';
import type { OrderStatus, ReservationStatus, DepositStatus } from './types';

/** Marca el email como verificado (tras abrir un enlace enviado a ese buzón). */
export async function markEmailVerified(user: User): Promise<void> {
  if (!user.email) return;
  await adminRpc('presale_mark_email_verified', { p_user_id: user.id, p_email: user.email });
}

/** Vincula reservas y pedidos hechos como invitado con el mismo email. */
export async function claimGuestRecords(user: User): Promise<{ reservations: number; orders: number }> {
  if (!user.email) return { reservations: 0, orders: 0 };
  try {
    const res = await adminRpc<{ ok: boolean; reservations?: number; orders?: number }>('presale_claim_guest_records', {
      p_user_id: user.id,
      p_email: user.email,
    });
    return { reservations: res.reservations ?? 0, orders: res.orders ?? 0 };
  } catch (err) {
    console.error('[account] no se pudieron vincular compras de invitado', err);
    return { reservations: 0, orders: 0 };
  }
}

export interface AccountReservation {
  id: string;
  code: string;
  status: ReservationStatus;
  deposit_status: DepositStatus;
  product_name: string;
  finish_name: string;
  diameter: number | string;
  width: number | string;
  et: number;
  quantity_sets: number;
  units_per_set: number;
  subtotal_cents: number;
  discount_bps: number;
  discount_cents: number;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
  balance_due_at: string | null;
  created_at: string;
  order_id: string | null;
  config_review_status: 'pending' | 'approved' | 'rejected';
}

export interface AccountOrder {
  id: string;
  code: string | null;
  kind: 'cart' | 'direct' | 'presale';
  status: OrderStatus;
  amount_total_cents: number | null;
  created_at: string;
  carrier: string | null;
  tracking_number: string | null;
  order_items: { product_name: string; finish_name: string | null; quantity: number; sets: number | null }[];
}

export interface AccountData {
  profile: { email: string; full_name: string | null; phone: string | null; email_verified_at: string | null } | null;
  reservations: AccountReservation[];
  orders: AccountOrder[];
  claimed: { reservations: number; orders: number };
}

export async function loadAccount(user: User, auth: AuthContext): Promise<AccountData> {
  const claimed = await claimGuestRecords(user);
  const db = auth.supabase;
  const [profile, reservations, orders] = await Promise.all([
    db.from('profiles').select('email, full_name, phone, email_verified_at').eq('id', user.id).maybeSingle(),
    db
      .from('reservations')
      .select(
        'id, code, status, deposit_status, product_name, finish_name, diameter, width, et, quantity_sets, units_per_set, ' +
          'subtotal_cents, discount_bps, discount_cents, total_cents, deposit_cents, balance_cents, balance_due_at, ' +
          'created_at, order_id, config_review_status'
      )
      .neq('status', 'abandoned')
      .order('created_at', { ascending: false }),
    db
      .from('orders')
      .select('id, code, kind, status, amount_total_cents, created_at, carrier, tracking_number, order_items(product_name, finish_name, quantity, sets)')
      .order('created_at', { ascending: false }),
  ]);
  for (const res of [profile, reservations, orders]) {
    if (res.error) throw res.error;
  }
  return {
    profile: (profile.data as AccountData['profile']) ?? null,
    reservations: (reservations.data ?? []) as unknown as AccountReservation[],
    orders: (orders.data ?? []) as unknown as AccountOrder[],
    claimed,
  };
}

export async function updateProfile(
  user: User,
  auth: AuthContext,
  fields: { fullName: string | null; phone: string | null }
): Promise<void> {
  const { error } = await auth.supabase
    .from('profiles')
    .update({ full_name: fields.fullName, phone: fields.phone })
    .eq('id', user.id);
  if (error) throw error;
}
