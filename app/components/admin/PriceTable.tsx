import type { ReferencePrice } from '~/lib/admin/store-stats';
import { formatPrice } from '~/lib/money';
import { LocalDateTime } from '~/components/presale/LocalDateTime';
import { StatusChip } from './AdminViz';

/** Precio vigente de cada referencia (panel y /admin/precios). */
export function PriceTable({ prices }: { prices: ReferencePrice[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table admin-table--stack">
        <thead>
          <tr><th>Referencia</th><th>Medida</th><th>ET</th><th className="num">Precio por llanta</th><th>Promoción</th></tr>
        </thead>
        <tbody>
          {prices.map((p) => (
            <tr key={p.variantId}>
              <td>{p.productName} {p.finishName}<div className="admin-muted">{p.variantId}</div></td>
              <td>{p.size}</td>
              <td>{p.et}</td>
              <td className="num">
                {p.promotion && p.baseCents != null && <span className="admin-strike">{formatPrice(p.baseCents)}</span>}
                <strong>{p.finalCents == null ? 'Sin precio' : formatPrice(p.finalCents)}</strong>
              </td>
              <td>
                {p.promotion ? (
                  <>
                    <StatusChip tone="good">{p.promotion.badge} −{p.promotion.percentOff} %</StatusChip>
                    <div className="admin-muted">hasta <LocalDateTime iso={p.promotion.endsAt} /></div>
                  </>
                ) : (
                  <span className="admin-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
