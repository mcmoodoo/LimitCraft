import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Link, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';
import CreateOrder from './pages/CreateOrder';
import OrderDetails from './pages/OrderDetails';
import Orders from './pages/Orders';

function Navigation() {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Home' },
    { path: '/orders', label: 'Orders' },
    { path: '/create-order', label: 'Create Order' },
  ];

  return (
    <nav className="flex items-center space-x-6">
      {navItems.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={`transition-colors ${
            location.pathname === item.path ? 'text-blue-400' : 'text-gray-300 hover:text-white'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function HomePage() {
  const { address, isConnected } = useAccount();

  return (
    <div className="text-center py-20">
      <h2 className="text-4xl font-bold mb-4">Welcome to Orderly</h2>
      <p className="text-xl text-gray-400 mb-8">Decentralized orderbook trading platform</p>

      <div className="max-w-md mx-auto space-y-4">
        {isConnected ? (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Connected Wallet</h3>
            <p className="text-gray-400 mb-4">{address}</p>
            <div className="flex space-x-4">
              <Link
                to="/orders"
                className="flex-1 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors text-center"
              >
                View Orders
              </Link>
              <Link
                to="/create-order"
                className="flex-1 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition-colors text-center"
              >
                Create Order
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Get Started</h3>
            <p className="text-gray-400">Connect your wallet to start trading</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AppContent() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header with wallet in top right */}
      <header className="fixed top-0 right-0 left-0 z-50 bg-gray-950/80 backdrop-blur-sm">
        <div className="flex justify-between items-center p-4">
          <Link to="/" className="text-2xl font-bold hover:text-blue-400 transition-colors">
            Orderly
          </Link>
          <div className="flex items-center gap-6">
            <Navigation />
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="pt-20 px-4">
        <div className="max-w-6xl mx-auto">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/order/:orderHash" element={<OrderDetails />} />
            <Route path="/create-order" element={<CreateOrder />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
