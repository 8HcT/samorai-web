import { useEffect, useState } from 'react';

/**
 * Fecha guardada en UTC mostrada en la zona horaria del NAVEGADOR del
 * cliente. En el servidor (y en el primer render) se usa hora de Madrid para
 * que el HTML coincida al hidratar; tras montar se pasa a la hora local.
 */
export function LocalDateTime({
  iso,
  dateOnly = false,
  className,
}: {
  iso: string | null | undefined;
  dateOnly?: boolean;
  className?: string;
}) {
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);

  if (!iso) return <span className={className}>—</span>;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return <span className={className}>—</span>;

  // Ojo: Intl no admite mezclar dateStyle/timeStyle con timeZoneName, así
  // que la versión local usa componentes sueltos.
  const options: Intl.DateTimeFormatOptions = dateOnly
    ? { dateStyle: 'long', ...(local ? {} : { timeZone: 'Europe/Madrid' }) }
    : local
      ? { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }
      : { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Madrid' };

  let text: string;
  try {
    text = new Intl.DateTimeFormat('es-ES', options).format(date);
  } catch {
    text = date.toISOString();
  }
  if (!local && !dateOnly) text = `${text} (hora de Madrid)`;

  return (
    <time dateTime={date.toISOString()} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}

/** Fecha sin hora guardada como `date` (YYYY-MM-DD): no depende de la zona. */
export function CalendarDate({ value }: { value: string | null | undefined }) {
  if (!value) return <span>—</span>;
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return (
    <time dateTime={value.slice(0, 10)}>
      {new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'UTC' }).format(date)}
    </time>
  );
}
