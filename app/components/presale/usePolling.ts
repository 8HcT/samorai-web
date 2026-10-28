import { useEffect, useRef } from 'react';
import { useRevalidator } from 'react-router';

/**
 * Recarga los datos del loader cada `intervalMs` mientras `active` (p. ej.
 * esperando a que llegue el webhook de Stripe tras pagar). Se detiene sola
 * tras `maxTimes` intentos.
 */
export function usePolling(active: boolean, intervalMs = 3000, maxTimes = 20): void {
  const revalidator = useRevalidator();
  const count = useRef(0);
  useEffect(() => {
    if (!active) {
      count.current = 0;
      return;
    }
    const timer = window.setInterval(() => {
      if (count.current >= maxTimes) {
        window.clearInterval(timer);
        return;
      }
      count.current += 1;
      if (revalidator.state === 'idle') revalidator.revalidate();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs, maxTimes, revalidator]);
}
