import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface Order {
  orderHash: string;
  createDateTime: string;
  remainingMakerAmount: string;
  makerBalance: string;
  makerAllowance: string;
  status: 'pending' | 'filled' | 'cancelled' | 'expired';
  data: {
    makerAsset: string;
    takerAsset: string;
    makingAmount: string;
    takingAmount: string;
    maker: string;
  };
  orderInvalidReason?: string;
  signature: string;
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/orders`);
      const result = await response.json();

      if (result.success) {
        setOrders(result.data);
      } else {
        setError(result.error);
      }
    } catch (_err) {
      setError('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const getStatusText = (order: Order) => {
    switch (order.status) {
      case 'pending':
        return 'Pending';
      case 'filled':
        return 'Filled';
      case 'cancelled':
        return 'Cancelled';
      case 'expired':
        return 'Expired';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = (order: Order) => {
    switch (order.status) {
      case 'pending':
        return 'text-green-400';
      case 'filled':
        return 'text-blue-400';
      case 'cancelled':
        return 'text-red-400';
      case 'expired':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatAmount = (amount: string) => {
    const num = BigInt(amount);
    return (Number(num) / 1e18).toFixed(6);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
        <h3 className="text-red-400 font-semibold mb-2">Error</h3>
        <p className="text-red-300">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Orders</h1>
        <Link
          to="/create-order"
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
        >
          Create Order
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg">No orders found</p>
          <Link
            to="/create-order"
            className="mt-4 inline-block bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg transition-colors"
          >
            Create Your First Order
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          You have {orders.length} orders
          {orders.map((order) => (
            <div
              key={order.orderHash}
              className="bg-gray-800 rounded-lg p-6 hover:bg-gray-700 transition-colors"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">
                    Order #{formatAddress(order.orderHash)}
                  </h3>
                  <div className="flex items-center space-x-4 text-sm text-gray-400">
                    <span>Maker: {formatAddress(order.data.maker)}</span>
                    <span className={getStatusColor(order)}>{getStatusText(order)}</span>
                    <span>{new Date(order.createDateTime).toLocaleDateString()}</span>
                  </div>
                </div>
                <Link
                  to={`/order/${order.orderHash}`}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View Details →
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-400">Making Amount</p>
                  <p className="font-medium">{formatAmount(order.data.makingAmount)}</p>
                  <p className="text-xs text-gray-500">{formatAddress(order.data.makerAsset)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Taking Amount</p>
                  <p className="font-medium">{formatAmount(order.data.takingAmount)}</p>
                  <p className="text-xs text-gray-500">{formatAddress(order.data.takerAsset)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
