import { Outlet, useLocation, useNavigation } from 'react-router';
import { Header } from '~/components/Header';
import { Footer } from '~/components/Footer';
import { CookieBanner } from '~/components/CookieBanner';
import { PageLoadingOverlay } from '~/components/PageSkeleton';
import { useDelayed } from '~/components/ui/useDelayed';
import { CartProvider } from '~/lib/cart/CartContext';
import { useT } from '~/i18n/useT';

/** Destinos fuera de este layout (tienen su propia carga o no son páginas). */
const OUTSIDE = /^\/(admin|api)(\/|$)/;

export default function Layout() {
  const t = useT();
  const navigation = useNavigation();
  const location = useLocation();
  const next = navigation.location?.pathname;
  // Ir a otra página (no enviar un formulario: los botones ya indican su espera).
  const changingPage =
    navigation.state === 'loading' &&
    (!navigation.formMethod || navigation.formMethod.toUpperCase() === 'GET') &&
    next != null &&
    next !== location.pathname &&
    !OUTSIDE.test(next);
  const showSkeleton = useDelayed(changingPage, 200);

  return (
    <CartProvider>
      <div className="site-shell">
        <Header />
        <main className="site-main" id="main-content">
          <Outlet />
        </main>
        <Footer />
        {/* Encima de la página actual y por debajo de la cabecera: así la
            posición de scroll de la página que se deja no cambia (al volver
            atrás se recupera) y la cabecera sigue a mano. */}
        {showSkeleton && next && (
          <PageLoadingOverlay path={next} label={t.a11y.loadingPage} />
        )}
        <CookieBanner />
      </div>
    </CartProvider>
  );
}
