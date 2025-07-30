import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Link } from 'react-router-dom';
import { Navigation } from './Navigation';
import { navigationHelpers } from '../../router/navigation';

export function Header() {
  return (
    <header className="fixed top-0 right-0 left-0 z-50 bg-gray-950/80 backdrop-blur-sm">
      <div className="flex justify-between items-center p-4">
        <Link 
          to={navigationHelpers.toHome()} 
          className="text-2xl font-bold hover:text-blue-400 transition-colors"
        >
          Orderly
        </Link>
        <div className="flex items-center gap-6">
          <Navigation />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}