import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { navigationHelpers } from '../../router/navigation';

export default function HomePage() {
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
                to={navigationHelpers.toOrders()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors text-center"
              >
                View Orders
              </Link>
              <Link
                to={navigationHelpers.toCreateOrder()}
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