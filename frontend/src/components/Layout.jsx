import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';

const Layout = () => {
  const location = useLocation();
  
  const isActive = (path) => location.pathname === path;
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center">
              <h1 className="text-2xl font-bold text-primary-600">Orderly</h1>
            </Link>
            
            {/* Navigation */}
            <nav className="flex space-x-8">
              <Link 
                to="/orders" 
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/orders') 
                    ? 'text-primary-600 bg-primary-50' 
                    : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
                }`}
              >
                Orders
              </Link>
              <Link 
                to="/create-order" 
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/create-order') 
                    ? 'text-primary-600 bg-primary-50' 
                    : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
                }`}
              >
                Create Order
              </Link>
            </nav>
            
            {/* Wallet Connection */}
            <ConnectButton />
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;