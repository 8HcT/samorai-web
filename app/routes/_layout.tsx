import { Outlet } from 'react-router';
import { Header } from '~/components/Header';
import { Footer } from '~/components/Footer';
import { CookieBanner } from '~/components/CookieBanner';
import { CartProvider } from '~/lib/cart/CartContext';

export default function Layout() {
  return (
    <CartProvider>
      <div className="site-shell">
        <Header />
        <main className="site-main" id="main-content">
          <Outlet />
        </main>
        <Footer />
        <CookieBanner />
      </div>
    </CartProvider>
  );
}
