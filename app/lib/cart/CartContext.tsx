import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  type CartLine,
  cartCount,
  readCart,
  writeCart,
} from './index';

interface CartContextValue {
  lines: CartLine[];
  count: number;
  /** true una vez hidratado desde localStorage (evita mismatch SSR). */
  ready: boolean;
  add: (variantId: string, quantity?: number) => void;
  remove: (variantId: string) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  // Hidratar desde localStorage tras montar (cliente).
  useEffect(() => {
    setLines(readCart());
    setReady(true);
  }, []);

  // Persistir en cada cambio (solo una vez hidratado).
  useEffect(() => {
    if (ready) writeCart(lines);
  }, [lines, ready]);

  // Sincronizar entre pestañas.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'samorai_cart_v1') setLines(readCart());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((variantId: string, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === variantId);
      if (existing) {
        return prev.map((l) =>
          l.variantId === variantId ? { ...l, quantity: l.quantity + quantity } : l
        );
      }
      return [...prev, { variantId, quantity }];
    });
  }, []);

  const remove = useCallback((variantId: string) => {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  }, []);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.variantId !== variantId)
        : prev.map((l) => (l.variantId === variantId ? { ...l, quantity } : l))
    );
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(
    () => ({ lines, count: cartCount(lines), ready, add, remove, setQuantity, clear }),
    [lines, ready, add, remove, setQuantity, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de <CartProvider>');
  return ctx;
}
