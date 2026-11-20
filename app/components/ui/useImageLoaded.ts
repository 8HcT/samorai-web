import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ¿Ha terminado de cargar la imagen? Sirve para enseñar un esqueleto en su
 * hueco mientras llega. Con SSR la imagen puede cargar antes de hidratar
 * (y entonces `onLoad` no llega a React), así que al montar se mira
 * `img.complete`.
 */
export function useImageLoaded(key: unknown) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const img = ref.current;
    setLoaded(Boolean(img && img.complete && img.naturalWidth > 0));
  }, [key]);

  const onLoad = useCallback(() => setLoaded(true), []);
  return { ref, loaded, onLoad };
}
