/**
 * Indicador de actividad circular. Toma el color del texto (currentColor),
 * así que sirve dentro de cualquier botón o línea de texto.
 * Con `label`, anuncia la espera a los lectores de pantalla.
 */
export function Spinner({ size = 16, label, className = '' }: { size?: number; label?: string; className?: string }) {
  return (
    <span
      className={`spin ${className}`}
      style={{ width: size, height: size }}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
