interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
  /** Nivel del título: `h1` cuando es el encabezado principal de la página. */
  as?: 'h1' | 'h2';
}

export function SectionHeader({ eyebrow, title, subtitle, center = false, as: Heading = 'h2' }: SectionHeaderProps) {
  return (
    <div className={`section-header${center ? ' section-header--center' : ''}`}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <Heading>{title}</Heading>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}
