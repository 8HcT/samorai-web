import type { Route } from './+types/batches';
import { Link, data, redirect, useNavigation } from 'react-router';
import { requireAdmin } from '~/lib/auth/session.server';
import { catalogProducts, createBatch, listBatches, setBatchProducts } from '~/lib/presale/admin.server';
import { adminReason, parseBatchForm } from '~/lib/presale/admin-forms.server';
import { BATCH_STATUS_LABEL, label } from '~/lib/presale/labels';
import { assertSameOrigin } from '~/lib/security.server';
import { BatchForm } from '~/components/admin/BatchForm';
import { StockBar } from '~/components/admin/AdminViz';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return { batches: await listBatches(), products: catalogProducts() };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { user } = await requireAdmin(request);
  const form = await request.formData();
  const { fields, errors } = parseBatchForm(form);
  if (errors.length > 0) return data({ errors }, { status: 400 });

  const created = await createBatch(fields, user.id);
  if (!created.ok) return data({ errors: [adminReason(created.reason)] }, { status: 400 });

  const slugs = form.getAll('products').map(String).filter((s) => catalogProducts().some((p) => p.slug === s));
  if (slugs.length > 0) await setBatchProducts(String(created.batch_id), slugs, user.id);
  throw redirect(`/admin/tiradas/${created.batch_id}?creada=1`);
}

export default function AdminBatches({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle';
  return (
    <>
      <h1 className="admin-title">Tiradas de fabricación</h1>
      <p className="admin-sub">Cada tirada tiene su capacidad, fechas, condiciones y stock. Sirve para la primera producción y para las siguientes.</p>

      <section className="admin-section">
        <h2>Tiradas</h2>
        {loaderData.batches.length === 0 ? (
          <p className="viz-empty">Todavía no hay tiradas.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--stack">
              <thead>
                <tr><th>Tirada</th><th>Estado</th><th className="num">Capacidad</th><th style={{ minWidth: 300 }}>Stock</th></tr>
              </thead>
              <tbody>
                {loaderData.batches.map(({ batch, inventory }) => (
                  <tr key={batch.id}>
                    <td><Link to={`/admin/tiradas/${batch.id}`}>{batch.name}</Link><div className="admin-muted">{batch.code}</div></td>
                    <td>{label(BATCH_STATUS_LABEL, batch.status)}</td>
                    <td className="num">{batch.capacity_sets}</td>
                    <td>
                      <StockBar
                        capacity={inventory.capacity_sets}
                        available={inventory.available_sets}
                        segments={[
                          { key: 'sold', label: 'Vendidos', value: inventory.sold_sets },
                          { key: 'reserved', label: 'Reservados', value: inventory.reserved_sets },
                          { key: 'held', label: 'En checkout', value: inventory.held_sets },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-section">
        <h2>Nueva tirada (se crea en borrador)</h2>
        {actionData?.errors && (
          <div className="admin-notice admin-notice--error" role="alert">
            {actionData.errors.map((e) => <div key={e}>{e}</div>)}
          </div>
        )}
        <BatchForm intent="create" products={loaderData.products} submitLabel="Crear tirada" busy={busy} />
      </section>
    </>
  );
}
