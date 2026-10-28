import { formatPrice } from '~/lib/money';
import { formatPercentFromBps } from '~/lib/presale/pricing';

export interface PriceBreakdownProps {
  subtotalCents: number;
  discountBps: number;
  discountCents: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  units: number;
  /** "today": antes de reservar · "paid": la señal ya está pagada. */
  depositState?: 'today' | 'paid';
  /** Si está pagada por completo, el pendiente se muestra como 0 / pagado. */
  fullyPaid?: boolean;
}

/** Desglose transparente: original → descuento → final → señal → pendiente. */
export function PriceBreakdown({
  subtotalCents,
  discountBps,
  discountCents,
  totalCents,
  depositCents,
  balanceCents,
  units,
  depositState = 'today',
  fullyPaid = false,
}: PriceBreakdownProps) {
  return (
    <dl className="price-breakdown">
      <div>
        <dt>Precio de las llantas ({units} uds.)</dt>
        <dd>{formatPrice(subtotalCents)}</dd>
      </div>
      {discountCents > 0 && (
        <div className="price-breakdown__discount">
          <dt>Descuento de preventa ({formatPercentFromBps(discountBps)})</dt>
          <dd>−{formatPrice(discountCents)}</dd>
        </div>
      )}
      <div className="price-breakdown__total">
        <dt>Precio final (IVA incluido)</dt>
        <dd>{formatPrice(totalCents)}</dd>
      </div>
      <div>
        <dt>{depositState === 'today' ? 'Reserva hoy' : 'Reserva abonada'}</dt>
        <dd>{depositState === 'today' ? formatPrice(depositCents) : `−${formatPrice(depositCents)}`}</dd>
      </div>
      <div className="price-breakdown__balance">
        <dt>{fullyPaid ? 'Pendiente' : depositState === 'today' ? 'Pendiente tras el lanzamiento' : 'Importe pendiente'}</dt>
        <dd>{fullyPaid ? 'Pagado' : formatPrice(balanceCents)}</dd>
      </div>
    </dl>
  );
}
