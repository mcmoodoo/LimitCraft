import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { navigationHelpers } from '../navigation';

interface WalletGuardProps {
  children: ReactNode;
  redirectTo?: string;
}

export function WalletGuard({ children, redirectTo }: WalletGuardProps) {
  const { isConnected } = useAccount();
  const location = useLocation();

  if (!isConnected) {
    const returnTo = redirectTo || location.pathname + location.search;
    const connectUrl = navigationHelpers.toWalletConnect(returnTo);
    return <Navigate to={connectUrl} replace />;
  }

  return <>{children}</>;
}

export function WalletRedirect() {
  const { isConnected } = useAccount();
  const location = useLocation();

  if (isConnected) {
    const searchParams = new URLSearchParams(location.search);
    const returnTo = searchParams.get('returnTo') || navigationHelpers.toHome();
    return <Navigate to={returnTo} replace />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4">
        <h1 className="text-4xl font-bold mb-4">Connect Your Wallet</h1>
        <p className="text-xl text-gray-400 mb-8">
          Please connect your wallet to access this feature
        </p>
        <div className="bg-gray-800 rounded-lg p-6">
          <p className="text-gray-300 mb-4">You'll be redirected automatically once connected</p>
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
