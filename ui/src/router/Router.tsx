import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { RootLayout } from '../layouts/RootLayout';
import { WalletGuard, WalletRedirect } from './guards/WalletGuard';

const HomePage = lazy(() => import('../pages/Home/HomePage'));
const OrdersList = lazy(() => import('../pages/orders/OrdersList'));
const CreateOrder = lazy(() => import('../pages/orders/CreateOrder'));
const OrderDetails = lazy(() => import('../pages/orders/OrderDetails'));

function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center min-h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>
  );
}

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingSpinner />}>{children}</Suspense>;
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: (
          <SuspenseWrapper>
            <HomePage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'orders',
        children: [
          {
            index: true,
            element: (
              <SuspenseWrapper>
                <WalletGuard>
                  <OrdersList />
                </WalletGuard>
              </SuspenseWrapper>
            ),
          },
          {
            path: 'create',
            element: (
              <SuspenseWrapper>
                <WalletGuard>
                  <CreateOrder />
                </WalletGuard>
              </SuspenseWrapper>
            ),
          },
          {
            path: ':orderHash',
            element: (
              <SuspenseWrapper>
                <WalletGuard>
                  <OrderDetails />
                </WalletGuard>
              </SuspenseWrapper>
            ),
          },
        ],
      },
      {
        path: 'wallet/connect',
        element: (
          <SuspenseWrapper>
            <WalletRedirect />
          </SuspenseWrapper>
        ),
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}