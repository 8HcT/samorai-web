/**
 * Piezas de visualización del panel (HTML/CSS, sin librerías).
 *
 * Reglas aplicadas (guía de dataviz):
 *  · Indicador = número, no gráfico (StatTile / HeroFigure).
 *  · Magnitud de una sola serie → barras horizontales finas de UN color, con
 *    el valor en el extremo (texto en tinta, nunca en el color del dato).
 *  · Parte de un todo (stock) → barra apilada con huecos de 2 px, leyenda
 *    siempre visible con valores (la identidad nunca depende solo del color).
 *  · Colores validados con validate_palette.js en claro y oscuro (admin.css).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ORDER_STATUS_LABEL, label } from '~/lib/presale/labels';

export function HeroFigure({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div className="viz-hero">
      <p className="viz-hero__label">{label}</p>
      <p className="viz-hero__value">{value}</p>
      {hint && <p className="viz-hero__hint">{hint}</p>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  href,
  attention = false,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  /** Enlace a la lista que explica la cifra (p. ej. pedidos por enviar). */
  href?: string;
  /** Resalta la cifra cuando pide hacer algo. */
  attention?: boolean;
}) {
  const className = `viz-tile${attention ? ' viz-tile--attention' : ''}`;
  const body = (
    <>
      <p className="viz-tile__label">{label}</p>
      <p className="viz-tile__value">{value}</p>
      {hint && <p className="viz-tile__hint">{hint}</p>}
    </>
  );
  return href ? (
    <Link to={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  /** Texto del valor (p. ej. "12 juegos"); por defecto el número. */
  display?: string;
}

/** Lista de barras horizontales de una sola serie (título = qué se mide). */
export function BarList({ title, unit, data, empty = 'Sin datos todavía' }: { title: string; unit: string; data: BarDatum[]; empty?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="viz-bars">
      <figcaption className="viz-bars__title">
        {title} <span className="viz-bars__unit">({unit})</span>
      </figcaption>
      {data.length === 0 ? (
        <p className="viz-empty">{empty}</p>
      ) : (
        <ul className="viz-bars__list">
          {data.map((d) => (
            <li key={d.label} className="viz-bars__row" title={`${d.label}: ${d.display ?? d.value}`} tabIndex={0}>
              <span className="viz-bars__label">{d.label}</span>
              <span className="viz-bars__track" aria-hidden="true">
                <span className="viz-bars__fill" style={{ width: `${Math.max(2, (d.value / max) * 100)}%` }} />
              </span>
              <span className="viz-bars__value">{d.display ?? d.value}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

export interface StockSegment {
  key: 'sold' | 'reserved' | 'held';
  label: string;
  value: number;
}

/**
 * Ocupación de la tirada: vendidos · reservados · en checkout, sobre la
 * capacidad total; el resto de la pista son los disponibles.
 */
export function StockBar({ capacity, segments, available }: { capacity: number; segments: StockSegment[]; available: number }) {
  const total = Math.max(capacity, 1);
  return (
    <figure className="viz-stock">
      <div
        className="viz-stock__bar"
        role="img"
        aria-label={`${segments.map((s) => `${s.label}: ${s.value}`).join(', ')}, disponibles: ${available} de ${capacity}`}
      >
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span
              key={s.key}
              className={`viz-stock__seg viz-stock__seg--${s.key}`}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.label}: ${s.value} juegos`}
            />
          ))}
      </div>
      <figcaption className="viz-legend">
        {segments.map((s) => (
          <span key={s.key} className="viz-legend__item">
            <span className={`viz-legend__swatch viz-stock__seg--${s.key}`} aria-hidden="true" />
            {s.label} <strong>{s.value}</strong>
          </span>
        ))}
        <span className="viz-legend__item">
          <span className="viz-legend__swatch viz-legend__swatch--track" aria-hidden="true" />
          Disponibles <strong>{available}</strong> de {capacity}
        </span>
      </figcaption>
    </figure>
  );
}

export type Tone = 'good' | 'warning' | 'critical' | 'neutral' | 'info' | 'violet';

const TONE_ICON: Record<Tone, string> = {
  good: '✓',
  warning: '!',
  critical: '×',
  neutral: '•',
  info: 'i',
  violet: '→',
};

/** Aviso de estado con icono + texto (el color nunca va solo). */
export function StatusChip({
  tone,
  children,
  size = 'md',
  icon,
}: {
  tone: Tone;
  children: ReactNode;
  size?: 'sm' | 'md';
  /** Símbolo propio (por defecto, el del tono). */
  icon?: string;
}) {
  return (
    <span className={`status-chip status-chip--${tone}${size === 'sm' ? ' status-chip--sm' : ''}`}>
      <span className="status-chip__icon" aria-hidden="true">{icon ?? TONE_ICON[tone]}</span>
      <span>{children}</span>
    </span>
  );
}

/** Tono e icono de cada estado de pedido (pagado = toca prepararlo). */
const ORDER_TONE: Record<string, { tone: Tone; icon: string }> = {
  paid: { tone: 'warning', icon: '€' },
  in_production: { tone: 'info', icon: '⚙' },
  ready_to_ship: { tone: 'violet', icon: '▣' },
  shipped: { tone: 'info', icon: '→' },
  delivered: { tone: 'good', icon: '✓' },
  cancelled: { tone: 'neutral', icon: '×' },
  refunded: { tone: 'neutral', icon: '↺' },
};

export function OrderStatusChip({ status, size }: { status: string; size?: 'sm' | 'md' }) {
  const t = ORDER_TONE[status] ?? { tone: 'neutral' as Tone, icon: '•' };
  return (
    <StatusChip tone={t.tone} icon={t.icon} size={size}>
      {label(ORDER_STATUS_LABEL, status)}
    </StatusChip>
  );
}
