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

export function HeroFigure({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div className="viz-hero">
      <p className="viz-hero__label">{label}</p>
      <p className="viz-hero__value">{value}</p>
      {hint && <p className="viz-hero__hint">{hint}</p>}
    </div>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div className="viz-tile">
      <p className="viz-tile__label">{label}</p>
      <p className="viz-tile__value">{value}</p>
      {hint && <p className="viz-tile__hint">{hint}</p>}
    </div>
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

/** Aviso de estado con icono + texto (el color nunca va solo). */
export function StatusChip({ tone, children }: { tone: 'good' | 'warning' | 'critical' | 'neutral'; children: ReactNode }) {
  const icon = tone === 'good' ? '✓' : tone === 'warning' ? '!' : tone === 'critical' ? '×' : '•';
  return (
    <span className={`status-chip status-chip--${tone}`}>
      <span aria-hidden="true">{icon}</span> {children}
    </span>
  );
}
