import type { Route } from './+types/status';
import { useEffect, useRef } from 'react';
import { Form, Link, data, useNavigation, useRevalidator } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import { assertSameOrigin } from '~/lib/security.server';
import { loadTestProgress, loadTestPurchase, runHealthChecks, type HealthStatus } from '~/lib/admin/health.server';
import { refundOrder } from '~/lib/presale/admin.server';
import { stripeErrorMessage } from '~/lib/stripe/errors';
import { formatPrice } from '~/lib/money';
import { TEST_PRICE_CENTS, TEST_VARIANT_ID } from '~/lib/orders/test-purchase';
import { StatusChip } from '~/components/admin/AdminViz';
import { LocalDateTime } from '~/components/presale/LocalDateTime';

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const prueba = new URL(request.url).searchParams.get('prueba');
  const [{ checks, testPurchase }, progress] = await Promise.all([
    runHealthChecks(request),
    prueba && SESSION_ID.test(prueba) ? loadTestProgress(prueba) : Promise.resolve(null),
  ]);
  return {
    checks,
    testPurchase,
    progress,
    returnState: prueba && !SESSION_ID.test(prueba) ? prueba : null,
    checkedAt: new Date().toISOString(),
  };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  await requireAdmin(request);
  const form = await request.formData();
  if (form.get('intent') !== 'refund_test') return data({ ok: false, message: 'Acción no reconocida.' }, { status: 400 });

  // Solo se devuelve desde aquí una compra de PRUEBA (las reales, desde su pedido).
  const test = await loadTestPurchase();
  if (!test || test.id !== String(form.get('order_id') ?? '')) {
    return data({ ok: false, message: 'Esa compra de prueba ya no es la última; ábrela desde Pedidos.' }, { status: 400 });
  }
  try {
    const res = await refundOrder(test.id);
    return res.ok
      ? data({ ok: true, message: `Devuelto ${formatPrice(res.refundedCents ?? 0)}. Stripe se queda la comisión del pago (unos céntimos).` })
      : data({ ok: false, message: res.reason === 'nothing_to_refund' ? 'Ya estaba devuelta.' : `No se pudo devolver (${res.reason}).` }, { status: 400 });
  } catch (err) {
    console.error('[admin][estado] devolución de prueba', err);
    return data({ ok: false, message: stripeErrorMessage(err) ?? 'Error inesperado al devolver.' }, { status: 500 });
  }
}

const TONE: Record<HealthStatus, 'good' | 'warning' | 'critical' | 'neutral'> = {
  ok: 'good',
  warning: 'warning',
  error: 'critical',
  info: 'neutral',
};
const STATUS_LABEL: Record<HealthStatus, string> = { ok: 'Correcto', warning: 'Revisar', error: 'Error', info: 'Info' };

/** Mientras el pedido de prueba no aparece, se vuelve a comprobar cada 3 s (máx. ~1,5 min). */
function usePollWhile(active: boolean) {
  const revalidator = useRevalidator();
  const tries = useRef(0);
  useEffect(() => {
    if (!active || tries.current >= 30) return;
    const t = window.setTimeout(() => {
      tries.current += 1;
      revalidator.revalidate();
    }, 3000);
    return () => window.clearTimeout(t);
  }, [active, revalidator]);
}

export default function AdminStatus({ loaderData, actionData }: Route.ComponentProps) {
  const { checks, testPurchase, progress, returnState, checkedAt } = loaderData;
  const busy = useNavigation().state !== 'idle';
  const errors = checks.filter((c) => c.status === 'error').length;
  const warnings = checks.filter((c) => c.status === 'warning').length;

  const waitingForOrder = Boolean(progress && progress.paid !== false && !progress.order && !progress.stripeError);
  usePollWhile(waitingForOrder);

  const steps = progress
    ? [
        { label: 'Pago cobrado en Stripe', done: progress.paid === true, failed: progress.paid === false || Boolean(progress.stripeError) },
        { label: 'Aviso de Stripe recibido y pedido guardado', done: Boolean(progress.order), failed: false },
        { label: 'Correo de confirmación al cliente', done: progress.order?.emails?.customer === 'sent', failed: progress.order?.emails?.customer === 'failed' },
        { label: 'Aviso de venta a la tienda', done: progress.order?.emails?.shop === 'sent', failed: progress.order?.emails?.shop === 'failed' },
        {
          label: 'Euro devuelto',
          done: Boolean(progress.order && progress.order.refundedCents >= progress.order.amountCents && progress.order.amountCents > 0),
          failed: false,
        },
      ]
    : [];

  const pendingRefund =
    testPurchase && testPurchase.amountCents > 0 && testPurchase.refundedCents < testPurchase.amountCents ? testPurchase : null;

  return (
    <>
      <h1 className="admin-title">Estado del sistema</h1>
      <p className="admin-sub">
        Comprobaciones en vivo de todo lo que interviene en una venta. Se repiten cada vez que abres esta página
        (última: <LocalDateTime iso={checkedAt} />).
      </p>

      {actionData && (
        <div className={`admin-notice ${actionData.ok ? 'admin-notice--ok' : 'admin-notice--error'}`} role="status">{actionData.message}</div>
      )}
      {returnState === 'cancelada' && (
        <div className="admin-notice" role="status">Has salido del pago de prueba sin pagar: no se ha cobrado nada.</div>
      )}
      {returnState === 'error' && (
        <div className="admin-notice admin-notice--error" role="alert">
          No se pudo abrir el pago de prueba en Stripe. Mira abajo «Stripe · clave de pagos».
        </div>
      )}

      {progress && (
        <section className="admin-section" aria-live="polite">
          <h2>Compra de prueba en curso</h2>
          <ol className="admin-steps">
            {steps.map((s) => (
              <li key={s.label} className={s.done ? 'is-done' : s.failed ? 'is-failed' : 'is-pending'}>
                <span aria-hidden="true">{s.done ? '✓' : s.failed ? '✕' : '…'}</span> {s.label}
              </li>
            ))}
          </ol>
          {waitingForOrder && <p className="admin-muted">Esperando el aviso de Stripe (suele tardar unos segundos)…</p>}
          {progress.stripeError && <p className="admin-muted">Stripe: {progress.stripeError}</p>}
          {progress.paid && !progress.order && !waitingForOrder && (
            <div className="admin-notice admin-notice--error" role="alert">
              Stripe cobró, pero el pedido no ha llegado. Revisa en Stripe → Developers → Webhooks que el endpoint
              <code> https://www.samoraiwheels.com/api/stripe-webhook</code> exista en modo Live, tenga los 5 eventos y que su
              signing secret sea el de STRIPE_WEBHOOK_SECRET.
            </div>
          )}
          {progress.order && (
            <p>
              Pedido <Link to={`/admin/pedidos/${progress.order.id}`}>{progress.order.code}</Link>.{' '}
              {progress.order.emails && (progress.order.emails.errors ?? []).length > 0 && (
                <span className="admin-muted">Avisos: {(progress.order.emails.errors ?? []).join(' · ')}</span>
              )}
            </p>
          )}
        </section>
      )}

      <section className="admin-section">
        <h2>
          Comprobaciones{' '}
          {errors > 0 ? (
            <StatusChip tone="critical">{errors} con error</StatusChip>
          ) : warnings > 0 ? (
            <StatusChip tone="warning">{warnings} a revisar</StatusChip>
          ) : (
            <StatusChip tone="good">Todo correcto</StatusChip>
          )}
        </h2>
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--stack">
            <thead>
              <tr><th>Estado</th><th>Qué se comprueba</th><th>Resultado</th></tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td><StatusChip tone={TONE[c.status]}>{STATUS_LABEL[c.status]}</StatusChip></td>
                  <td><strong>{c.title}</strong></td>
                  <td>
                    {c.detail}
                    {c.at && <div className="admin-muted"><LocalDateTime iso={c.at} /></div>}
                    {c.hint && <div className="admin-muted">→ {c.hint}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h2>Compra de prueba ({formatPrice(TEST_PRICE_CENTS)})</h2>
        <p>
          Hace una compra real de {formatPrice(TEST_PRICE_CENTS)} con una referencia oculta que solo puedes comprar tú, por el
          mismo camino que un cliente: pago en Stripe, aviso del webhook, pedido guardado, correo al cliente y aviso a la
          tienda (marcados como <strong>[PRUEBA]</strong>). Al volver verás cada paso marcado aquí. No cuenta en las ventas.
        </p>
        <ul className="admin-muted">
          <li>Usa tu tarjeta real: la clave es LIVE, así que el cobro es real.</li>
          <li>Después devuélvelo con el botón. Stripe se queda su comisión (unos 0,26 €).</li>
          <li>Hazla tras cada cambio importante y antes de una campaña (p. ej. Black Friday).</li>
        </ul>
        <div className="admin-actions">
          {/* Formulario normal (no fetch): /api/checkout redirige a Stripe. */}
          <form method="post" action="/api/checkout">
            <input type="hidden" name="cart" value={JSON.stringify([{ variantId: TEST_VARIANT_ID, quantity: 1 }])} />
            <button type="submit" className="btn btn-primary btn-sm">Hacer compra de prueba de {formatPrice(TEST_PRICE_CENTS)}</button>
          </form>
          {pendingRefund && (
            <Form method="post">
              <input type="hidden" name="intent" value="refund_test" />
              <input type="hidden" name="order_id" value={pendingRefund.id} />
              <button type="submit" className="btn btn-outline btn-sm" disabled={busy}>
                Devolver la prueba {pendingRefund.code}
              </button>
            </Form>
          )}
        </div>
      </section>
    </>
  );
}
