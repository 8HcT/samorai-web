interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}

export function SectionHeader({ eyebrow, title, subtitle, center = false }: SectionHeaderProps) {
  return (
    <div className={`section-header${center ? ' section-header--center' : ''}`}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}
