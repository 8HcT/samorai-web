import type { Route } from './+types/reserva.confirmada';
import { assertPresaleEnabled } from '~/lib/presale/config.server';
import { redirect } from 'react-router';
import { Button } from '~/components/Button';
import { accessToken } from '~/lib/presale/access.server';
import { findReservationByDepositSession } from '~/lib/presale/views.server';

export function meta({}: Route.MetaArgs) {
  return [{ title: 'Reserva | SAMORAI' }, { name: 'robots', content: 'noindex, nofollow' }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
}

/**
 * Vuelta de Stripe tras pagar la reserva. La confirmación real llega por
 * webhook; aquí solo se redirige a la página de la reserva, que muestra el
 * estado y se actualiza sola hasta que el pago queda confirmado.
 */
export async function loader({ request }: Route.LoaderArgs) {
  assertPresaleEnabled();
  const sessionId = new URL(request.url).searchParams.get('session_id') ?? '';
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return { found: false };
  const reservation = await findReservationByDepositSession(sessionId);
  if (!reservation) return { found: false };
  const token = accessToken('reservation', reservation.id, reservation.access_version);
  throw redirect(`/reserva/${reservation.id}?t=${token}&pagada=1`);
}

export default function ReservationReturn() {
  return (
    <div className="placeholder-page">
      <div className="placeholder-page__inner">
        <h1>Reserva no encontrada</h1>
        <p>
          No hemos podido localizar la reserva de este pago. Si has pagado, recibirás la confirmación por email en
          unos minutos; si no llega, escríbenos desde la página de contacto.
        </p>
        <Button href="/contacto" variant="primary">Contacto</Button>
      </div>
    </div>
  );
}
