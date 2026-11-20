import { useEffect, useState } from 'react';
import { useNavigation } from 'react-router';

type Phase = 'idle' | 'loading' | 'done';

/**
 * Barra fina de progreso arriba de la pantalla mientras se carga otra página
 * o se envía un formulario. Aparece tras un instante (las navegaciones
 * rápidas no parpadean) y se completa al terminar.
 */
export function NavProgress() {
  const busy = useNavigation().state !== 'idle';
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    if (busy) {
      const t = window.setTimeout(() => setPhase('loading'), 120);
      return () => window.clearTimeout(t);
    }
    setPhase((p) => (p === 'loading' ? 'done' : 'idle'));
  }, [busy]);

  useEffect(() => {
    if (phase !== 'done') return;
    const t = window.setTimeout(() => setPhase('idle'), 500);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === 'idle') return null;
  return (
    <div className={`nav-progress nav-progress--${phase}`} aria-hidden="true">
      <span className="nav-progress__bar" />
    </div>
  );
}
