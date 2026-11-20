import { useEffect, useState } from 'react';

/** true solo si `active` dura más de `ms` (las cargas rápidas no parpadean). */
export function useDelayed(active: boolean, ms: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) {
      setOn(false);
      return;
    }
    const t = window.setTimeout(() => setOn(true), ms);
    return () => window.clearTimeout(t);
  }, [active, ms]);
  return on;
}
