import { Outlet } from 'react-router';
import { Header } from '~/components/Header';
import { Footer } from '~/components/Footer';

export default function Layout() {
  return (
    <div className="site-shell">
      <Header />
      <main className="site-main" id="main-content">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
