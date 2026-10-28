import type { Route } from './+types/checkout.cancelado';
import { Form, Link, data } from 'react-router';
import { verifyAccessToken } from '~/lib/presale/access.server';
import { cancelPendingCheckout, findPendingCheckout, resumeUrl } from '~/lib/presale/checkout.server';
import { isUuid } from '~/lib/presale/views.server';
import { PRIVATE_PAGE_HEADERS, assertSameOrigin } from '~/lib/security.server';
import { LocalDateTime } from '~/components/presale/LocalDateTime';

export function meta({}: Route.MetaArgs) {
  return [{ title: 'Pago no completado | SAMORAI' }, { name: 'robots', content: 'noindex, nofollow' }];
}

export function headers() {
  return PRIVATE_PAGE_HEADERS;
}

type Kind = 'reservation' | 'allocation';

function readParams(url: URL | FormData) {
  const get = (k: string) => (url instanceof URL ? url.searchParams.get(k) : String(url.get(k) ?? '')) || null;
  const kind = get('k') === 'allocation' ? 'allocation' : 'reservation';
  return { kind: kind as Kind, id: get('id'), token: get('t') };
}

async function authorizedPending(kind: Kind, id: string | null, token: string | null) {
  if (!isUuid(id) || !verifyAccessToken(kind, id, 1, token)) return null;
  return findPendingCheckout(kind, id);
}

/**
 * El cliente vuelve de Stripe sin pagar. Su plaza sigue retenida unos
 * minutos: puede retomar el pago o liberarla ya (se expira la sesión de
 * Stripe antes de liberar, para que no pueda pagarse después).
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { kind, id, token } = readParams(new URL(request.url));
  const pending = await authorizedPending(kind, id, token);
  if (!pending) return { state: 'invalid' as const, kind, id, token, holdExpiresAt: null, resume: null };
  if (pending.status !== 'held' || !pending.holdExpiresAt || new Date(pending.holdExpiresAt) <= new Date()) {
    return { state: pending.status === 'held' ? ('expired' as const) : (pending.status as string), kind, id, token, holdExpiresAt: null, resume: null };
  }
  const resume = pending.sessionId ? await resumeUrl(pending.sessionId) : null;
  return { state: 'held' as const, kind, id, token, holdExpiresAt: pending.holdExpiresAt, resume };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { kind, id, token } = readParams(await request.formData());
  const pending = await authorizedPending(kind, id, token);
  if (!pending) return data({ released: false, reason: 'invalid' }, { status: 400 });
  const result = await cancelPendingCheckout(pending);
  return { released: result.released, reason: result.reason ?? null };
}

export default function CheckoutCancelled({ loaderData, actionData }: Route.ComponentProps) {
  const { state, kind, id, token, holdExpiresAt, resume } = loaderData;
  const released = actionData && 'released' in actionData && actionData.released;

  return (
    <div className="placeholder-page">
      <div className="placeholder-page__inner">
        <div className="placeholder-page__icon" aria-hidden="true">×</div>
        <h1>Pago no completado</h1>

        {released ? (
          <p>Hemos liberado la plaza. Puedes volver a reservar o comprar cuando quieras.</p>
        ) : state === 'held' ? (
          <>
            <p>
              No se ha realizado ningún cargo. Mantenemos tu plaza retenida hasta{' '}
              <strong><LocalDateTime iso={holdExpiresAt} /></strong> por si quieres terminar el pago.
            </p>
            <div className="placeholder-page__actions">
              {resume && (
                <a href={resume} className="btn btn-primary btn-lg">Retomar el pago</a>
              )}
              <Form method="post">
                <input type="hidden" name="k" value={kind} />
                <input type="hidden" name="id" value={id ?? ''} />
                <input type="hidden" name="t" value={token ?? ''} />
                <button type="submit" className="btn btn-outline btn-lg">Liberar la plaza</button>
              </Form>
            </div>
          </>
        ) : state === 'reserved' || state === 'sold' ? (
          <p>Este pago ya se completó. Revisa tu email: te hemos enviado la confirmación.</p>
        ) : (
          <p>No se ha realizado ningún cargo y la plaza ya está liberada.</p>
        )}

        <p style={{ marginTop: 'var(--space-6)' }}>
          <Link to="/the-wheels">Volver a las llantas</Link>
        </p>
      </div>
    </div>
  );
}
