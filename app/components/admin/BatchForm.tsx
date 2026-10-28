import { Form } from 'react-router';
import type { BatchRow } from '~/lib/presale/rows';
import { utcIsoToMadridLocal } from '~/lib/presale/datetime';

interface BatchFormProps {
  batch?: BatchRow | null;
  intent: 'create' | 'update';
  products: { slug: string; name: string }[];
  selectedProducts?: string[];
  submitLabel: string;
  busy?: boolean;
}

function euros(cents: number | undefined): string {
  return cents == null ? '50' : String(cents / 100).replace('.', ',');
}

function percent(bps: number | undefined): string {
  return bps == null ? '5' : String(bps / 100).replace('.', ',');
}

/**
 * Formulario de tirada. Las fechas se introducen en hora de Madrid y se
 * guardan en UTC. Los cambios de reserva/descuento/condiciones solo afectan a
 * reservas NUEVAS (cada reserva guarda su instantánea).
 */
export function BatchForm({ batch, intent, products, selectedProducts = [], submitLabel, busy }: BatchFormProps) {
  const isDraft = !batch || batch.status === 'draft';
  const launched = batch && !['draft', 'presale_open', 'presale_closed'].includes(batch.status);
  return (
    <Form method="post" className="admin-form">
      <input type="hidden" name="intent" value={intent} />

      <div className="admin-form-row">
        <label className="admin-field">
          Nombre visible *
          <input name="name" required maxLength={80} defaultValue={batch?.name ?? 'First Production Run'} />
        </label>
        <label className="admin-field">
          Identificador {isDraft ? '*' : '(fijo tras el borrador)'}
          <input name="code" required pattern="[a-z0-9][a-z0-9\-]{1,62}" defaultValue={batch?.code ?? ''} readOnly={!isDraft} placeholder="victoria-run-01" />
        </label>
        <label className="admin-field">
          Capacidad total (juegos) *
          <input name="capacity_sets" type="number" min={0} required defaultValue={batch?.capacity_sets ?? ''} />
        </label>
        <label className="admin-field">
          Máx. juegos por reserva/pedido
          <input name="max_sets_per_order" type="number" min={1} max={20} defaultValue={batch?.max_sets_per_order ?? 2} />
        </label>
      </div>

      <label className="admin-field">
        Descripción (opcional, visible en la ficha)
        <textarea name="description" maxLength={2000} defaultValue={batch?.description ?? ''} style={{ minHeight: 70 }} />
      </label>

      {intent === 'create' && (
        <fieldset className="admin-form-row">
          <legend className="admin-muted">Modelos incluidos</legend>
          {products.map((p) => (
            <label key={p.slug} className="admin-check">
              <input type="checkbox" name="products" value={p.slug} defaultChecked={selectedProducts.includes(p.slug) || products.length === 1} />
              {p.name}
            </label>
          ))}
        </fieldset>
      )}

      <div className="admin-form-row">
        <label className="admin-field">
          Apertura de la preventa (hora de Madrid)
          <input name="presale_opens_at" type="datetime-local" defaultValue={utcIsoToMadridLocal(batch?.presale_opens_at)} />
        </label>
        <label className="admin-field">
          Cierre de la preventa (hora de Madrid)
          <input name="presale_closes_at" type="datetime-local" defaultValue={utcIsoToMadridLocal(batch?.presale_closes_at)} />
        </label>
        <label className="admin-field">
          Lanzamiento oficial previsto (hora de Madrid)
          <input name="planned_launch_at" type="datetime-local" defaultValue={utcIsoToMadridLocal(batch?.planned_launch_at)} />
        </label>
        <label className="admin-field">
          Entrega estimada
          <input name="estimated_delivery_on" type="date" defaultValue={batch?.estimated_delivery_on ?? ''} />
        </label>
      </div>
      <label className="admin-field">
        Nota de entrega (p. ej. «Primavera 2027»)
        <input name="estimated_delivery_note" maxLength={200} defaultValue={batch?.estimated_delivery_note ?? ''} />
      </label>

      <div className="admin-form-row">
        <label className="admin-field">
          Reserva por juego (€, IVA incl.)
          <input name="deposit_eur" inputMode="decimal" required defaultValue={euros(batch?.deposit_cents)} />
        </label>
        <label className="admin-field">
          Descuento de preventa (%)
          <input name="discount_percent" inputMode="decimal" required defaultValue={percent(batch?.presale_discount_bps)} />
        </label>
        <label className="admin-check" style={{ alignSelf: 'end' }}>
          <input type="checkbox" name="presale_discount_enabled" defaultChecked={batch ? batch.presale_discount_enabled : true} />
          Descuento activo
        </label>
      </div>

      <div className="admin-form-row">
        <label className="admin-field">
          Plazo para pagar tras el lanzamiento (días)
          <input name="balance_window_days" type="number" min={3} max={365} defaultValue={batch?.balance_window_days ?? 30} disabled={Boolean(launched)} />
        </label>
        <label className="admin-field">
          Primer recordatorio (día)
          <input name="first_reminder_day" type="number" min={1} defaultValue={batch?.first_reminder_day ?? 15} disabled={Boolean(launched)} />
        </label>
        <label className="admin-field">
          Aviso de caducidad (día)
          <input name="final_reminder_day" type="number" min={2} defaultValue={batch?.final_reminder_day ?? 25} disabled={Boolean(launched)} />
        </label>
      </div>
      {launched && (
        <>
          <input type="hidden" name="balance_window_days" value={batch!.balance_window_days} />
          <input type="hidden" name="first_reminder_day" value={batch!.first_reminder_day} />
          <input type="hidden" name="final_reminder_day" value={batch!.final_reminder_day} />
        </>
      )}

      <fieldset className="admin-form">
        <legend className="admin-muted">
          Condiciones (texto que acepta el cliente). Pendientes de validación legal: el sistema no las redacta.
        </legend>
        <label className="admin-field">
          Condiciones de reserva *
          <textarea name="reservation_terms" defaultValue={batch?.reservation_terms ?? ''} />
        </label>
        <label className="admin-field">
          Política de cancelación *
          <textarea name="cancellation_policy" defaultValue={batch?.cancellation_policy ?? ''} />
        </label>
        <label className="admin-field">
          Política de devolución *
          <textarea name="refund_policy" defaultValue={batch?.refund_policy ?? ''} />
        </label>
        <label className="admin-field">
          Caducidad de la reserva *
          <textarea name="expiry_policy" defaultValue={batch?.expiry_policy ?? ''} />
        </label>
        <div className="admin-form-row">
          <label className="admin-field">
            Reserva abonada al caducar
            <select name="expiry_deposit_policy" defaultValue={batch?.expiry_deposit_policy ?? 'manual_review'}>
              <option value="manual_review">Decisión manual caso a caso (por defecto)</option>
              <option value="refund">Marcar para devolver (el reembolso lo confirma el admin)</option>
              <option value="retain">Conservarla (solo con condiciones validadas)</option>
            </select>
          </label>
          <label className="admin-check" style={{ alignSelf: 'end' }}>
            <input type="checkbox" name="policies_legally_validated" defaultChecked={batch?.policies_legally_validated ?? false} />
            Condiciones revisadas y validadas legalmente
          </label>
        </div>
        <p className="admin-muted">* Obligatorias para abrir la preventa. Se guarda una copia en cada reserva.</p>
      </fieldset>

      <div className="admin-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>{submitLabel}</button>
      </div>
    </Form>
  );
}
