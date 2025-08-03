import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { navigationHelpers } from '../../router/navigation';
import { Navigation } from './Navigation';

export function Header() {
  return (
    <header className="fixed top-0 right-0 left-0 z-50 bg-gray-950/95 backdrop-blur-md border-b border-gray-800/50">
      <div className="flex justify-between items-center px-6 py-3">
        {/* Logo with enhanced styling */}
        <Link
          to={navigationHelpers.toHome()}
          className="flex items-center gap-2 text-2xl font-bold hover:text-blue-400 transition-all duration-200 group"
        >
          <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg group-hover:scale-110 transition-transform duration-200">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
            LimitCraft
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <Navigation />
          
          {/* Enhanced Connect Button wrapper */}
          <div className="ml-4">
            <ConnectButton 
              accountStatus="address"
              chainStatus="icon"
              showBalance={false}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
