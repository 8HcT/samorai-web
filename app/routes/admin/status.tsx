import type { Route } from './+types/status';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Await, Form, Link, data, useRevalidator } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import { assertSameOrigin } from '~/lib/security.server';
import {
  loadTestProgress,
  loadTestPurchase,
  runHealthChecks,
  type HealthCheck,
  type HealthStatus,
} from '~/lib/admin/health.server';
import { refundOrder } from '~/lib/presale/admin.server';
import { stripeErrorMessage } from '~/lib/stripe/errors';
import { formatPrice } from '~/lib/money';
import { TEST_PRICE_CENTS, TEST_VARIANT_ID } from '~/lib/orders/test-purchase';
import { StatusChip } from '~/components/admin/AdminViz';
import { LocalDateTime } from '~/components/presale/LocalDateTime';
import { Skeleton, SkeletonText } from '~/components/ui/Skeleton';
import { Spinner } from '~/components/ui/Spinner';
import { SubmitButton } from '~/components/ui/SubmitButton';
import { Toast } from '~/components/ui/Toast';

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const prueba = new URL(request.url).searchParams.get('prueba');
  const now = new Date();
  const [testPurchase, progress] = await Promise.all([
    loadTestPurchase().catch(() => null),
    prueba && SESSION_ID.test(prueba) ? loadTestProgress(prueba) : Promise.resolve(null),
  ]);
  return {
    // Diferido: cada comprobación puede tardar hasta 8 s. La página se pinta
    // ya (con esqueletos) y los resultados llegan después.
    checks: runHealthChecks(request, now, testPurchase).then((r) => r.checks),
    testPurchase,
    progress,
    returnState: prueba && !SESSION_ID.test(prueba) ? prueba : null,
    checkedAt: now.toISOString(),
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

const TONE: Record<HealthStatus, 'good' | 'warning' | 'critical' | 'info'> = {
  ok: 'good',
  warning: 'warning',
  error: 'critical',
  info: 'info',
};
const STATUS_LABEL: Record<HealthStatus, string> = { ok: 'Correcto', warning: 'Revisar', error: 'Error', info: 'Info' };
const STATUS_ICON: Record<HealthStatus, string> = { ok: '✓', warning: '!', error: '×', info: 'i' };
const ORDER: Record<HealthStatus, number> = { error: 0, warning: 1, info: 2, ok: 3 };

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

function ChecksSkeleton() {
  return (
    <ul className="check-list" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i}>
          <Skeleton width={26} height={26} radius="50%" />
          <div>
            <Skeleton width="45%" height="1em" />
            <div style={{ marginTop: 8 }}><SkeletonText lines={1} /></div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ChecksList({ checks }: { checks: HealthCheck[] }) {
  const sorted = [...checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  return (
    <ul className="check-list">
      {sorted.map((c) => (
        <li key={c.id} className={`is-${c.status}`}>
          <span className={`check-list__icon check-list__icon--${c.status}`} aria-hidden="true">{STATUS_ICON[c.status]}</span>
          <p className="check-list__title">
            {c.title}
            <StatusChip tone={TONE[c.status]} size="sm">{STATUS_LABEL[c.status]}</StatusChip>
          </p>
          <p className="check-list__detail">{c.detail}</p>
          {c.at && <p className="check-list__meta"><LocalDateTime iso={c.at} compact /></p>}
          {c.hint && <p className="check-list__hint">{c.hint}</p>}
        </li>
      ))}
    </ul>
  );
}

function ChecksSummary({ checks }: { checks: HealthCheck[] }) {
  const errors = checks.filter((c) => c.status === 'error').length;
  const warnings = checks.filter((c) => c.status === 'warning').length;
  return errors > 0 ? (
    <StatusChip tone="critical">{errors} con error</StatusChip>
  ) : warnings > 0 ? (
    <StatusChip tone="warning">{warnings} a revisar</StatusChip>
  ) : (
    <StatusChip tone="good">Todo correcto</StatusChip>
  );
}

/** Botón de compra de prueba: es un formulario normal que lleva a Stripe. */
function TestPurchaseButton() {
  const [leaving, setLeaving] = useState(false);
  // Al volver con el botón «atrás» del navegador, la página sale de la caché: reactivar.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => e.persisted && setLeaving(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  return (
    <form method="post" action="/api/checkout" onSubmit={() => setLeaving(true)}>
      <input type="hidden" name="cart" value={JSON.stringify([{ variantId: TEST_VARIANT_ID, quantity: 1 }])} />
      <button type="submit" className="btn btn-primary" disabled={leaving} aria-busy={leaving || undefined}>
        {leaving && <Spinner size={14} />}
        {leaving ? 'Abriendo el pago en Stripe…' : `Hacer compra de prueba de ${formatPrice(TEST_PRICE_CENTS)}`}
      </button>
    </form>
  );
}

export default function AdminStatus({ loaderData, actionData }: Route.ComponentProps) {
  const { checks, testPurchase, progress, returnState, checkedAt } = loaderData;
  const revalidator = useRevalidator();

  const waitingForOrder = Boolean(progress && progress.paid !== false && !progress.order && !progress.stripeError);
  usePollWhile(waitingForOrder);

  const steps = progress
    ? [
        { label: 'Pago cobrado en Stripe', done: progress.paid === true, failed: progress.paid === false || Boolean(progress.stripeError) },
        { label: 'Aviso de Stripe recibido y pedido guardado', done: Boolean(progress.order), failed: false, hint: waitingForOrder ? 'Esperando el aviso de Stripe (suele tardar unos segundos)…' : undefined },
        { label: 'Correo de confirmación al cliente', done: progress.order?.emails?.customer === 'sent', failed: progress.order?.emails?.customer === 'failed' },
        { label: 'Aviso de venta a la tienda', done: progress.order?.emails?.shop === 'sent', failed: progress.order?.emails?.shop === 'failed' },
        {
          label: 'Prueba devuelta',
          done: Boolean(progress.order && progress.order.refundedCents >= progress.order.amountCents && progress.order.amountCents > 0),
          failed: false,
        },
      ]
    : [];
  const currentIndex = steps.findIndex((s) => !s.done && !s.failed);

  const pendingRefund =
    testPurchase && testPurchase.amountCents > 0 && testPurchase.refundedCents < testPurchase.amountCents ? testPurchase : null;
  const rechecking = revalidator.state === 'loading' && !waitingForOrder;

  return (
    <>
      <Toast result={actionData} />
      <div className="admin-pagehead">
        <div>
          <h1 className="admin-title">Estado del sistema</h1>
          <p className="admin-sub">
            Comprobaciones en vivo de todo lo que interviene en una venta (última: <LocalDateTime iso={checkedAt} compact />).
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => revalidator.revalidate()} disabled={revalidator.state !== 'idle'}>
          {rechecking && <Spinner size={14} />}
          {rechecking ? 'Comprobando…' : 'Volver a comprobar'}
        </button>
      </div>

      {returnState === 'cancelada' && (
        <div className="admin-notice" role="status"><div>Has salido del pago de prueba sin pagar: no se ha cobrado nada.</div></div>
      )}
      {returnState === 'error' && (
        <div className="admin-notice admin-notice--error" role="alert">
          <div>No se pudo abrir el pago de prueba en Stripe. Mira abajo «Stripe · clave de pagos».</div>
        </div>
      )}

      {progress && (
        <section className="admin-section" aria-live="polite" aria-busy={waitingForOrder || undefined}>
          <h2>Compra de prueba en curso</h2>
          <ol className="admin-steps">
            {steps.map((s, i) => {
              const state = s.done ? 'is-done' : s.failed ? 'is-failed' : i === currentIndex ? 'is-current' : 'is-pending';
              return (
                <li key={s.label} className={state}>
                  <span className="admin-steps__dot" aria-hidden="true">
                    {s.done ? '✓' : s.failed ? '✕' : i === currentIndex && waitingForOrder ? <Spinner size={12} /> : i + 1}
                  </span>
                  <span className="admin-steps__label">
                    {s.label}
                    <span className="sr-only">{s.done ? ' (hecho)' : s.failed ? ' (ha fallado)' : ' (pendiente)'}</span>
                    {s.hint && i === currentIndex && <small>{s.hint}</small>}
                  </span>
                </li>
              );
            })}
          </ol>
          {progress.stripeError && <p className="admin-muted">Stripe: {progress.stripeError}</p>}
          {progress.paid && !progress.order && !waitingForOrder && (
            <div className="admin-notice admin-notice--error" role="alert">
              <div>
                Stripe cobró, pero el pedido no ha llegado. Revisa en Stripe → Developers → Webhooks que el endpoint
                <code> https://www.samoraiwheels.com/api/stripe-webhook</code> exista en modo Live, tenga los 5 eventos y que su
                signing secret sea el de STRIPE_WEBHOOK_SECRET (y que se haya vuelto a desplegar tras cambiarlo).
              </div>
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

      <section className="admin-section" aria-labelledby="checks-title">
        <h2 id="checks-title">
          Comprobaciones
          <Suspense fallback={<span className="admin-skel-chip skeleton" style={{ width: 120 }} aria-hidden="true" />}>
            <Await resolve={checks} errorElement={null}>
              {(c) => <ChecksSummary checks={c} />}
            </Await>
          </Suspense>
        </h2>
        <Suspense
          fallback={
            <div role="status" aria-label="Comprobando el sistema…">
              <ChecksSkeleton />
            </div>
          }
        >
          <Await
            resolve={checks}
            errorElement={
              <div className="admin-notice admin-notice--error" role="alert">
                <div>No se pudieron hacer las comprobaciones. Vuelve a intentarlo en unos segundos.</div>
              </div>
            }
          >
            {(c) => <ChecksList checks={c} />}
          </Await>
        </Suspense>
      </section>

      <section className="admin-section">
        <h2>Compra de prueba ({formatPrice(TEST_PRICE_CENTS)})</h2>
        <p style={{ margin: '0 0 12px' }}>
          Hace una compra real de {formatPrice(TEST_PRICE_CENTS)} por el mismo camino que un cliente: pago en Stripe, aviso del
          webhook, pedido guardado, correo al cliente y aviso a la tienda (marcados como <strong>[PRUEBA]</strong>). Al volver
          verás cada paso marcado aquí. No cuenta en las ventas.
        </p>
        <ul className="admin-hint">
          <li>La clave es LIVE: el cobro a tu tarjeta es real.</li>
          <li>Después, devuélvelo con el botón. Stripe se queda su comisión (unos 0,26 €).</li>
          <li>Hazla tras cada cambio importante y antes de una campaña (p. ej. Black Friday).</li>
        </ul>
        <div className="admin-actions">
          <TestPurchaseButton />
          {pendingRefund && (
            <Form method="post">
              <input type="hidden" name="intent" value="refund_test" />
              <input type="hidden" name="order_id" value={pendingRefund.id} />
              <SubmitButton className="btn btn-outline" match={{ intent: 'refund_test' }} pendingText="Devolviendo…">
                Devolver la prueba {pendingRefund.code}
              </SubmitButton>
            </Form>
          )}
        </div>
      </section>
    </>
  );
}
