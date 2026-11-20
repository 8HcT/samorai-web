import { useEffect, useState } from 'react';
import { IconCopy } from './icons';

/** Copia un texto al portapapeles y confirma con «Copiado» durante unos segundos. */
export function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const t = window.setTimeout(() => setState('idle'), 2500);
    return () => window.clearTimeout(t);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('error');
    }
  }

  return (
    <button type="button" className="btn btn-outline btn-sm" onClick={copy} aria-live="polite">
      <IconCopy />
      {state === 'copied' ? 'Copiado ✓' : state === 'error' ? 'No se pudo copiar' : label}
    </button>
  );
}
