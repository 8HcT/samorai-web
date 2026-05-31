interface SpecItem {
  label: string;
  value: string | number;
}

interface SpecListProps {
  specs: SpecItem[];
}

export function SpecList({ specs }: SpecListProps) {
  return (
    <dl className="spec-list">
      {specs.map((item) => (
        <div key={item.label} className="spec-list__item">
          <dt className="spec-list__label">{item.label}</dt>
          <dd className="spec-list__value mono">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
