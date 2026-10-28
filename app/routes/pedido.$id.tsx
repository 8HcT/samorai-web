import type { Route } from './+types/pedido.$id';
import { Link } from 'react-router';
import { formatEt, formatSize } from '~/lib/format';
import { formatPrice } from '~/lib/money';
import { ORDER_STATUS_LABEL, label } from '~/lib/presale/labels';
import { loadOrderView } from '~/lib/presale/views.server';
import { PRIVATE_PAGE_HEADERS } from '~/lib/security.server';
import { CalendarDate, LocalDateTime } from '~/components/presale/LocalDateTime';

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: data?.view ? `Pedido ${data.view.order.code ?? ''} | SAMORAI` : 'Pedido | SAMORAI' },
    { name: 'robots', content: 'noindex, nofollow' },
  ];
}

export function headers() {
  return PRIVATE_PAGE_HEADERS;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const view = await loadOrderView(request, params.id, new URL(request.url).searchParams.get('t'));
  if (!view) throw new Response('Pedido no encontrado', { status: 404 });
  return { view };
}

const STEPS = ['paid', 'in_production', 'ready_to_ship', 'shipped', 'delivered'] as const;

export default function OrderPage({ loaderData }: Route.ComponentProps) {
  const { view } = loaderData;
  const o = view.order;
  const current = STEPS.indexOf(o.status as (typeof STEPS)[number]);
  const closed = o.status === 'cancelled' || o.status === 'refunded';

  return (
    <div className="section">
      <div className="container account-page">
        <p className="eyebrow">{o.kind === 'presale' ? 'Pedido de preventa' : 'Pedido'}</p>
        <h1 className="account-page__title">Pedido {o.code ?? o.stripe_session_id.slice(-8).toUpperCase()}</h1>
        <p className="caption">Realizado el <LocalDateTime iso={o.created_at} /></p>

        {closed ? (
          <div className="notice notice--warn" role="status">{label(ORDER_STATUS_LABEL, o.status)}</div>
        ) : (
          <ol className="order-steps" aria-label="Estado del pedido">
            {STEPS.map((step, i) => (
              <li key={step} className={i <= current ? 'is-done' : undefined} aria-current={i === current ? 'step' : undefined}>
                {label(ORDER_STATUS_LABEL, step)}
              </li>
            ))}
          </ol>
        )}

        <div className="account-grid">
          <section className="account-card">
            <h2 className="account-card__title">Artículos</h2>
            <table className="simple-table">
              <tbody>
                {view.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.product_name}</strong>{i.finish_name ? ` · ${i.finish_name}` : ''}
                      <br />
                      <span className="caption">
                        {i.diameter != null && i.width != null ? `${formatSize(Number(i.diameter), Number(i.width))} ` : ''}
                        {i.et != null ? formatEt(i.et) : ''} · {i.quantity} llantas{i.sets ? ` (${i.sets} ${i.sets === 1 ? 'juego' : 'juegos'})` : ''}
                      </span>
                    </td>
                    <td className="num">{formatPrice(i.unit_price_cents * i.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="kv">
              {o.discount_cents > 0 && (
                <div><dt>Descuento de preventa</dt><dd>−{formatPrice(o.discount_cents)}</dd></div>
              )}
              <div><dt>Total (IVA incluido)</dt><dd><strong>{formatPrice(o.amount_total_cents)}</strong></dd></div>
              {view.reservation && (
                <div><dt>Incluye reserva abonada</dt><dd>{formatPrice(view.reservation.deposit_cents)}</dd></div>
              )}
              {o.refunded_cents > 0 && (
                <div><dt>Devuelto</dt><dd>{formatPrice(o.refunded_cents)}</dd></div>
              )}
            </dl>
          </section>

          <section className="account-card">
            <h2 className="account-card__title">Envío</h2>
            {o.shipping_address ? (
              <p>
                {[o.shipping_address.name, o.shipping_address.line1, o.shipping_address.line2,
                  [o.shipping_address.postalCode, o.shipping_address.city].filter(Boolean).join(' '),
                  o.shipping_address.country].filter(Boolean).join(' · ')}
              </p>
            ) : (
              <p className="caption">Sin dirección registrada.</p>
            )}
            {o.carrier && <p>Transportista: {o.carrier}</p>}
            {o.tracking_number && <p>Seguimiento: <strong>{o.tracking_number}</strong></p>}
            {o.shipped_at && <p className="caption">Enviado el <LocalDateTime iso={o.shipped_at} /></p>}
            {view.batch && (view.batch.estimated_delivery_on || view.batch.estimated_delivery_note) && !o.shipped_at && (
              <p className="caption">
                Entrega estimada ({view.batch.name}):{' '}
                {view.batch.estimated_delivery_on && <CalendarDate value={view.batch.estimated_delivery_on} />}
                {view.batch.estimated_delivery_note ? ` ${view.batch.estimated_delivery_note}` : ''}
              </p>
            )}
          </section>
        </div>

        {view.viewer === 'token' && (
          <p className="caption">
            <Link to="/cuenta/acceso">Accede con tu email</Link> para ver todos tus pedidos en «Mi cuenta».
          </p>
        )}
      </div>
    </div>
  );
}
