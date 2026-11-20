import type { ReferencePrice } from '~/lib/admin/store-stats';
import { formatPrice } from '~/lib/money';
import { LocalDateTime } from '~/components/presale/LocalDateTime';
import { StatusChip } from './AdminViz';

/** Precio vigente de cada referencia (panel y /admin/precios). */
export function PriceTable({ prices }: { prices: ReferencePrice[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table admin-table--stack admin-table--prices">
        <thead>
          <tr><th>Referencia</th><th>Medida</th><th className="num">Precio por llanta</th><th>Promoción</th></tr>
        </thead>
        <tbody>
          {prices.map((p) => (
            <tr key={p.variantId}>
              <td className="c-ref" title={p.variantId}>
                <span className="cell-strong">{p.productName} {p.finishName}</span>
              </td>
              <td className="c-size nowrap">{p.size} · {p.et}</td>
              <td className="c-price num price-cell">
                {p.promotion && p.baseCents != null && <span className="admin-strike">{formatPrice(p.baseCents)}</span>}
                <strong>{p.finalCents == null ? 'Sin precio' : formatPrice(p.finalCents)}</strong>
              </td>
              <td className={`c-promo${p.promotion ? '' : ' is-empty'}`}>
                {p.promotion ? (
                  <>
                    <StatusChip tone="good" size="sm">{p.promotion.badge} −{p.promotion.percentOff} %</StatusChip>
                    <span className="cell-sub">hasta <LocalDateTime iso={p.promotion.endsAt} compact /></span>
                  </>
                ) : (
                  <span className="admin-muted">Sin promoción</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
