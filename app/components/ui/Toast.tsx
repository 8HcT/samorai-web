import { useEffect, useState } from 'react';

export interface ToastMessage {
  ok: boolean;
  message: string;
}

/**
 * Aviso flotante con el resultado de una acción (guardar, devolver…). Se ve
 * aunque el botón pulsado quede lejos del principio de la página. Los
 * mensajes de éxito se ocultan solos; los de error esperan a que se cierren.
 */
export function Toast({ result }: { result: ToastMessage | null | undefined }) {
  const [shown, setShown] = useState<ToastMessage | null>(null);

  // Cada envío trae un objeto nuevo, aunque el texto se repita.
  useEffect(() => {
    if (!result?.message) return;
    setShown(result);
    if (!result.ok) return;
    const t = window.setTimeout(() => setShown(null), 6000);
    return () => window.clearTimeout(t);
  }, [result]);

  if (!shown) return null;
  return (
    <div className="toast-region">
      <div
        className={`toast ${shown.ok ? 'toast--ok' : 'toast--error'}`}
        role={shown.ok ? 'status' : 'alert'}
      >
        <span className="toast__icon" aria-hidden="true">{shown.ok ? '✓' : '!'}</span>
        <p className="toast__text">{shown.message}</p>
        <button type="button" className="toast__close" onClick={() => setShown(null)} aria-label="Cerrar aviso">
          ×
        </button>
      </div>
    </div>
  );
}
