import type { Route } from './+types/pedido.confirmado';
import { assertPresaleEnabled } from '~/lib/presale/config.server';
import { redirect } from 'react-router';
import { accessToken } from '~/lib/presale/access.server';
import { findOrderBySession } from '~/lib/presale/views.server';
import { getSupabaseAdmin } from '~/lib/supabase/server';
import { usePolling } from '~/components/presale/usePolling';

export function meta({}: Route.MetaArgs) {
  return [{ title: 'Confirmando el pago | SAMORAI' }, { name: 'robots', content: 'noindex, nofollow' }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
}

/**
 * Vuelta de Stripe tras la compra directa o el pago final. El pedido lo crea
 * el webhook; mientras no llega, se espera aquí y se reintenta sola.
 */
export async function loader({ request }: Route.LoaderArgs) {
  assertPresaleEnabled();
  const sessionId = new URL(request.url).searchParams.get('session_id') ?? '';
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return { state: 'invalid' as const };

  const found = await findOrderBySession(sessionId);
  if (found?.kind === 'order') {
    throw redirect(`/pedido/${found.id}?t=${accessToken('order', found.id, found.access_version)}`);
  }
  if (found?.kind === 'payment' && found.reservation_id) {
    // Pago final aún procesándose: la página de la reserva lo muestra y se
    // actualiza sola hasta que exista el pedido.
    const { data } = await getSupabaseAdmin()
      .from('reservations')
      .select('id, access_version')
      .eq('id', found.reservation_id)
      .maybeSingle<{ id: string; access_version: number }>();
    if (data) throw redirect(`/reserva/${data.id}?t=${accessToken('reservation', data.id, data.access_version)}&pagada=1`);
  }
  return { state: 'waiting' as const };
}

export default function OrderReturn({ loaderData }: Route.ComponentProps) {
  usePolling(loaderData.state === 'waiting', 3000, 20);
  return (
    <div className="placeholder-page">
      <div className="placeholder-page__inner">
        <div className="placeholder-page__icon" aria-hidden="true">✓</div>
        <h1>{loaderData.state === 'invalid' ? 'Pedido no encontrado' : 'Confirmando tu pago…'}</h1>
        <p>
          {loaderData.state === 'invalid'
            ? 'No hemos podido identificar el pago. Si lo has completado recibirás la confirmación por email.'
            : 'Stripe nos está confirmando el pago. Esta página se actualizará sola; también recibirás la confirmación por email.'}
        </p>
      </div>
    </div>
  );
}
