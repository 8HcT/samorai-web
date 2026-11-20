import type { ReactNode } from 'react';
import { useNavigation } from 'react-router';
import { Spinner } from './Spinner';

/**
 * ¿Se está enviando ahora mismo un formulario con estos campos? Sirve para
 * mostrar la espera solo en el botón pulsado cuando hay varios formularios
 * en la página (p. ej. `{ intent: 'refund' }` o `{ intent: 'toggle', id }`).
 */
export function useIsSubmitting(match?: Record<string, string>): boolean {
  const nav = useNavigation();
  if (nav.state === 'idle' || !nav.formData) return false;
  if (!match) return true;
  return Object.entries(match).every(([k, v]) => nav.formData?.get(k) === v);
}

/**
 * Botón de envío que, mientras su formulario se procesa, muestra un indicador
 * de actividad y un texto de espera, y se desactiva para evitar dobles envíos.
 */
export function SubmitButton({
  children,
  pendingText,
  match,
  pending: pendingProp,
  className = 'abtn abtn--primary',
  disabled,
  name,
  value,
  title,
}: {
  children: ReactNode;
  /** Texto mientras se procesa (por defecto, el mismo). */
  pendingText?: ReactNode;
  /** Campos del formulario que identifican a este botón (ver useIsSubmitting). */
  match?: Record<string, string>;
  /** Estado de espera calculado fuera (p. ej. de un fetcher). */
  pending?: boolean;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
  title?: string;
}) {
  const navPending = useIsSubmitting(match);
  const pending = pendingProp ?? navPending;
  return (
    <button
      type="submit"
      className={`${className}${pending ? ' is-pending' : ''}`}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      name={name}
      value={value}
      title={title}
    >
      {pending && <Spinner size={14} />}
      <span>{pending && pendingText ? pendingText : children}</span>
    </button>
  );
}
