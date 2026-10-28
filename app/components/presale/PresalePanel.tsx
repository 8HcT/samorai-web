import { useEffect, useMemo, useState } from 'react';
import { Form, Link } from 'react-router';
import type { WheelVariant } from '~/types/product';
import { formatPrice } from '~/lib/money';
import { unitPriceCentsForWidth } from '~/lib/pricing';
import { directQuote, formatPercentFromBps, presaleQuote } from '~/lib/presale/pricing';
import { presaleErrorMessage } from '~/lib/presale/errors';
import type { ProductOffer, PublicBatch } from '~/lib/presale/types';
import { trackEvent } from '~/lib/analytics/trackEvent';
import { StockMeter } from './StockMeter';
import { PriceBreakdown } from './PriceBreakdown';
import { CalendarDate, LocalDateTime } from './LocalDateTime';

type ManagedOffer = Exclude<ProductOffer, { mode: 'legacy' }>;

interface PresalePanelProps {
  offer: ManagedOffer;
  productId: string;
  /** Referencia exacta elegida en el configurador (o undefined si falta). */
  variant: WheelVariant | undefined;
  /** Ancho elegido (para mostrar el precio aunque falte el ET). */
  width: number | null;
  finishSelected: boolean;
  defaultEmail: string | null;
  error: string | null;
  submitting: boolean;
}

const STATUS_CHIP: Record<ManagedOffer['mode'], string> = {
  presale: 'Preventa abierta',
  direct: 'Venta oficial',
  upcoming: 'Próximamente',
  closed: 'Preventa cerrada',
  sold_out: 'Tirada completa',
  unavailable: 'No disponible',
};

function PolicyTexts({ batch }: { batch: PublicBatch }) {
  const sections: [string, string | null][] = [
    ['Condiciones de reserva', batch.terms.reservation],
    ['Cancelación', batch.terms.cancellation],
    ['Devoluciones', batch.terms.refund],
    ['Caducidad de la reserva', batch.terms.expiry],
  ];
  return (
    <div className="presale-terms">
      {sections
        .filter(([, text]) => text && text.trim())
        .map(([title, text]) => (
          <details key={title} className="presale-terms__item">
            <summary>{title}</summary>
            <p>{text}</p>
          </details>
        ))}
    </div>
  );
}

function SetsSelector({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="config-qty" aria-label="Número de juegos">
      <button type="button" className="config-qty__btn" onClick={() => onChange(Math.max(1, value - 1))} aria-label="Un juego menos" disabled={value <= 1}>
        −
      </button>
      <span className="config-qty__count" aria-live="polite">{value}</span>
      <button type="button" className="config-qty__btn" onClick={() => onChange(Math.min(max, value + 1))} aria-label="Un juego más" disabled={value >= max}>
        +
      </button>
    </div>
  );
}

export function PresalePanel({
  offer,
  productId,
  variant,
  width,
  finishSelected,
  defaultEmail,
  error,
  submitting,
}: PresalePanelProps) {
  const batch = 'batch' in offer ? offer.batch : undefined;
  const [sets, setSets] = useState(1);

  // Disponibilidad de la referencia elegida (cupos incluidos).
  const variantAvailable = batch && variant ? batch.variantAvailable[variant.id] ?? batch.availableSets : batch?.availableSets ?? 0;
  const maxSets = batch ? Math.max(1, Math.min(batch.maxSetsPerOrder, variantAvailable || 1)) : 1;
  useEffect(() => {
    if (sets > maxSets) setSets(maxSets);
  }, [maxSets, sets]);

  const unitCents = width != null ? unitPriceCentsForWidth(width) : null;
  const presale = useMemo(
    () =>
      batch && unitCents != null && offer.mode === 'presale'
        ? presaleQuote({
            unitPriceCents: unitCents,
            unitsPerSet: batch.unitsPerSet,
            sets,
            discountBps: batch.discountBps,
            depositPerSetCents: batch.depositCents,
          })
        : null,
    [batch, unitCents, sets, offer.mode]
  );
  const direct = useMemo(
    () =>
      batch && unitCents != null && offer.mode === 'direct'
        ? directQuote({ unitPriceCents: unitCents, unitsPerSet: batch.unitsPerSet, sets })
        : null,
    [batch, unitCents, sets, offer.mode]
  );

  if (offer.mode === 'unavailable' && !batch) {
    return (
      <div className="presale-panel presale-panel--muted" role="status">
        <p>{presaleErrorMessage('unavailable')}</p>
      </div>
    );
  }
  if (!batch) return null;

  const configurationBlocked = variant != null && variantAvailable <= 0;
  const errorText = presaleErrorMessage(error);

  return (
    <section className="presale-panel" aria-labelledby="presale-panel-title">
      <header className="presale-panel__head">
        <p className="presale-panel__eyebrow" id="presale-panel-title">{batch.name}</p>
        <span className={`presale-chip presale-chip--${offer.mode}`}>{STATUS_CHIP[offer.mode]}</span>
      </header>

      {batch.description && <p className="presale-panel__lead">{batch.description}</p>}

      {(offer.mode === 'presale' || offer.mode === 'direct' || offer.mode === 'sold_out') && (
        <StockMeter available={batch.availableSets} capacity={batch.capacitySets} />
      )}

      <ul className="presale-panel__facts">
        {offer.mode !== 'direct' && batch.plannedLaunchAt && (
          <li>
            <span>Lanzamiento oficial estimado</span>
            <LocalDateTime iso={batch.plannedLaunchAt} dateOnly />
          </li>
        )}
        {offer.mode === 'upcoming' && batch.presaleOpensAt && (
          <li>
            <span>Apertura de la preventa</span>
            <LocalDateTime iso={batch.presaleOpensAt} />
          </li>
        )}
        {offer.mode === 'presale' && batch.presaleClosesAt && (
          <li>
            <span>Cierre de la preventa</span>
            <LocalDateTime iso={batch.presaleClosesAt} />
          </li>
        )}
        {(batch.estimatedDeliveryOn || batch.estimatedDeliveryNote) && (
          <li>
            <span>Entrega estimada</span>
            <span>
              {batch.estimatedDeliveryOn && <CalendarDate value={batch.estimatedDeliveryOn} />}
              {batch.estimatedDeliveryOn && batch.estimatedDeliveryNote ? ' · ' : ''}
              {batch.estimatedDeliveryNote}
            </span>
          </li>
        )}
        {offer.mode === 'presale' && (
          <li>
            <span>Reserva</span>
            <span>
              {formatPrice(batch.depositCents)} por juego
              {batch.discountBps > 0 ? ` · ${formatPercentFromBps(batch.discountBps)} de descuento de preventa` : ''}
            </span>
          </li>
        )}
      </ul>

      {offer.mode === 'upcoming' && <p className="presale-panel__note">La preventa todavía no ha abierto.</p>}
      {offer.mode === 'closed' && (
        <p className="presale-panel__note">La preventa de esta tirada está cerrada. La venta directa comenzará con el lanzamiento oficial.</p>
      )}
      {offer.mode === 'sold_out' && (
        <p className="presale-panel__note">Todos los juegos de esta tirada están reservados o vendidos. Si se libera alguna plaza volverá a aparecer aquí.</p>
      )}
      {offer.mode === 'unavailable' && <p className="presale-panel__note">Esta tirada ha finalizado.</p>}

      {(offer.mode === 'presale' || offer.mode === 'direct') && (
        <Form method="post" className="presale-form" onSubmit={() => trackEvent(offer.mode === 'presale' ? 'reserve_clicked' : 'buy_now_clicked', { productId, variantId: variant?.id ?? '', sets })}>
          <input type="hidden" name="intent" value={offer.mode === 'presale' ? 'reserve' : 'buy'} />
          <input type="hidden" name="variantId" value={variant?.id ?? ''} />
          <input type="hidden" name="sets" value={sets} />
          {/* Honeypot anti-bots: invisible para personas. */}
          <input type="text" name="company" tabIndex={-1} autoComplete="off" className="hp-field" aria-hidden="true" />

          {!finishSelected ? (
            <p className="caption">Selecciona un acabado para continuar.</p>
          ) : unitCents == null ? (
            <p className="caption">Selecciona una medida para ver el precio.</p>
          ) : presale ? (
            <PriceBreakdown {...presale} />
          ) : direct ? (
            <div className="product-detail__summary" aria-live="polite">
              <span className="product-detail__summary-total">{formatPrice(direct.totalCents)}</span>
              <span className="product-detail__summary-detail">
                {direct.units} × {formatPrice(direct.unitPriceCents)} · IVA incluido
              </span>
            </div>
          ) : null}

          {configurationBlocked && (
            <p className="presale-form__error" role="alert">Esta configuración no está disponible en la tirada. Prueba con otra medida, ET o acabado.</p>
          )}

          <div className="presale-form__row">
            <span className="product-detail__option-title" style={{ margin: 0 }}>Juegos de {batch.unitsPerSet} llantas</span>
            <SetsSelector value={sets} max={maxSets} onChange={setSets} />
          </div>

          {offer.mode === 'presale' && (
            <>
              <div className="presale-form__fields">
                <label className="presale-field">
                  <span>Email *</span>
                  <input type="email" name="email" required autoComplete="email" defaultValue={defaultEmail ?? ''} maxLength={254} />
                </label>
                <label className="presale-field">
                  <span>Nombre</span>
                  <input type="text" name="name" autoComplete="name" maxLength={120} />
                </label>
              </div>

              <details className="presale-vehicle">
                <summary>Tu vehículo (opcional)</summary>
                <p className="caption">Nos ayuda a validar la compatibilidad y a planificar futuras tiradas.</p>
                <div className="presale-form__fields presale-form__fields--3">
                  <label className="presale-field">
                    <span>Marca</span>
                    <input type="text" name="vehicleMake" maxLength={60} placeholder="BMW" />
                  </label>
                  <label className="presale-field">
                    <span>Modelo</span>
                    <input type="text" name="vehicleModel" maxLength={80} placeholder="Serie 3 (G20)" />
                  </label>
                  <label className="presale-field">
                    <span>Año</span>
                    <input type="number" name="vehicleYear" min={1950} max={2100} inputMode="numeric" />
                  </label>
                </div>
              </details>

              <PolicyTexts batch={batch} />

              <label className="presale-accept">
                <input type="checkbox" name="acceptTerms" required />
                <span>
                  He leído y acepto las condiciones de reserva, cancelación, devolución y caducidad de esta tirada.
                </span>
              </label>
            </>
          )}

          {errorText && (
            <p className="presale-form__error" role="alert">{errorText}</p>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg presale-form__submit"
            disabled={!variant || configurationBlocked || submitting}
          >
            {submitting ? 'Conectando con el pago seguro…' : offer.mode === 'presale' ? 'Reservar mi juego' : 'Comprar ahora'}
          </button>

          <p className="presale-form__foot">
            {offer.mode === 'presale'
              ? <>Ahora solo pagas la reserva ({formatPrice(batch.depositCents * sets)}). El resto se paga tras el lanzamiento oficial, con {batch.balanceWindowDays} días de plazo. Sin cargos automáticos.</>
              : <>Pago seguro con Stripe · IVA incluido · Envío gratuito.</>}
            {' '}
            No necesitas cuenta: <Link to="/cuenta/acceso">crear una</Link> es opcional. <Link to="/privacidad">Privacidad</Link>.
          </p>
        </Form>
      )}
    </section>
  );
}
