/**
 * Stock real de la tirada: «18 de 50 juegos disponibles» + barra de progreso.
 * Los datos vienen del servidor (PostgreSQL) en cada carga de la página.
 */
export function StockMeter({ available, capacity }: { available: number; capacity: number }) {
  const taken = Math.max(0, capacity - available);
  const pct = capacity > 0 ? Math.min(100, Math.round((taken / capacity) * 100)) : 100;
  return (
    <div className="stock-meter">
      <p className="stock-meter__count">
        <strong>{available}</strong> de {capacity} {capacity === 1 ? 'juego disponible' : 'juegos disponibles'}
      </p>
      <div
        className="stock-meter__bar"
        role="progressbar"
        aria-label="Juegos ya reservados de la tirada"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={taken}
        aria-valuetext={`${taken} de ${capacity} juegos reservados`}
      >
        <span className="stock-meter__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
