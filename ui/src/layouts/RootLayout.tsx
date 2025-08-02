import { Outlet } from 'react-router-dom';
import { Header } from './components/Header';
import { Breadcrumbs } from '../components/Breadcrumbs';

export function RootLayout() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />
      <main className="pt-20 px-4">
        <div className="max-w-6xl mx-auto">
          <Breadcrumbs />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
