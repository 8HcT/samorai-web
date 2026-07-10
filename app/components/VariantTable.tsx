import type { WheelVariant } from '~/types/product';

interface VariantTableProps {
  variants: WheelVariant[];
}

const STATUS_LABEL: Record<WheelVariant['stockStatus'], string> = {
  in_stock: 'In stock',
  low_stock: 'Low stock',
  out_of_stock: 'Unavailable',
  pre_order: 'Pre-order',
};

export function VariantTable({ variants }: VariantTableProps) {
  if (variants.length === 0) {
    return <p className="text-muted">No variants available for this selection.</p>;
  }

  return (
    <div className="variant-table-wrapper">
      <table className="spec-table" aria-label="Available variants">
        <thead>
          <tr>
            <th scope="col">Size</th>
            <th scope="col">Width</th>
            <th scope="col">ET</th>
            <th scope="col">PCD</th>
            <th scope="col">CB</th>
            <th scope="col">Load</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.id}>
              <td>{v.diameter}&Prime;</td>
              <td>{v.width}J</td>
              <td>ET{v.et}</td>
              <td>{v.pcd}</td>
              <td>{v.cb}mm</td>
              <td>{v.maxLoad}kg</td>
              <td>
                <span
                  className={`variant-table__status variant-table__status--${v.stockStatus}`}
                  aria-hidden="true"
                />
                {STATUS_LABEL[v.stockStatus]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
