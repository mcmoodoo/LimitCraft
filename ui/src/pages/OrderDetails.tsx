import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

interface OrderDetails {
  orderHash: string;
  createDateTime: string;
  remainingMakerAmount: string;
  makerBalance: string;
  makerAllowance: string;
  data: {
    makerAsset: string;
    takerAsset: string;
    makingAmount: string;
    takingAmount: string;
    maker: string;
    taker?: string;
    salt?: string;
    receiver?: string;
  };
  orderInvalidReason?: string;
  signature: string;
  makerRate: string;
  takerRate: string;
  isMakerContract: boolean;
}

export default function OrderDetails() {
  const { orderHash } = useParams<{ orderHash: string }>();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orderHash) {
      fetchOrder();
    }
  }, [orderHash]);

  const fetchOrder = async () => {
    try {
      const response = await fetch(`http://localhost:3000/order/${orderHash}`);
      const result = await response.json();

      if (result.success) {
        setOrder(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to fetch order details');
    } finally {
      setLoading(false);
    }
  };

  const getStatusText = (order: OrderDetails) => {
    if (order.orderInvalidReason) {
      return order.orderInvalidReason;
    }
    return order.remainingMakerAmount === '0' ? 'Filled' : 'Active';
  };

  const getStatusColor = (order: OrderDetails) => {
    if (order.orderInvalidReason) {
      if (order.orderInvalidReason.includes('expired')) return 'text-yellow-400 bg-yellow-900/20';
      return 'text-red-400 bg-red-900/20';
    }
    return order.remainingMakerAmount === '0'
      ? 'text-blue-400 bg-blue-900/20'
      : 'text-green-400 bg-green-900/20';
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatAmount = (amount: string) => {
    const num = BigInt(amount);
    return (Number(num) / 1e18).toFixed(6);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
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
        <Link to="/orders" className="mt-4 inline-block text-blue-400 hover:text-blue-300">
          ← Back to Orders
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">Order not found</p>
        <Link to="/orders" className="mt-4 inline-block text-blue-400 hover:text-blue-300">
          ← Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center mb-6">
        <Link to="/orders" className="text-blue-400 hover:text-blue-300 mr-4">
          ← Back to Orders
        </Link>
        <h1 className="text-3xl font-bold">Order Details</h1>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">Order #{formatAddress(order.orderHash)}</h2>
            <div className="flex items-center space-x-4">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(order)}`}
              >
                {getStatusText(order)}
              </span>
              <span className="text-gray-400">
                Created: {new Date(order.createDateTime).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-3">Order Information</h3>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Order Hash:</span>
                  <div className="flex items-center">
                    <span className="font-mono text-sm">{formatAddress(order.orderHash)}</span>
                    <button
                      onClick={() => copyToClipboard(order.orderHash)}
                      className="ml-2 text-blue-400 hover:text-blue-300"
                    >
                      📋
                    </button>
                  </div>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-400">Maker:</span>
                  <div className="flex items-center">
                    <span className="font-mono text-sm">{formatAddress(order.data.maker)}</span>
                    <button
                      onClick={() => copyToClipboard(order.data.maker)}
                      className="ml-2 text-blue-400 hover:text-blue-300"
                    >
                      📋
                    </button>
                  </div>
                </div>

                {order.data.taker && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Taker:</span>
                    <div className="flex items-center">
                      <span className="font-mono text-sm">{formatAddress(order.data.taker)}</span>
                      <button
                        onClick={() => copyToClipboard(order.data.taker)}
                        className="ml-2 text-blue-400 hover:text-blue-300"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                )}

                {order.data.salt && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Salt:</span>
                    <span className="font-mono text-sm">{formatAddress(order.data.salt)}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-gray-400">Remaining Amount:</span>
                  <span className="text-sm">{formatAmount(order.remainingMakerAmount)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-400">Maker Rate:</span>
                  <span className="text-sm">{parseFloat(order.makerRate).toFixed(6)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-3">Trading Details</h3>

              <div className="space-y-4">
                <div className="bg-gray-700 rounded-lg p-4">
                  <h4 className="font-medium text-green-400 mb-2">Making (Sell)</h4>
                  <p className="text-2xl font-bold">{formatAmount(order.data.makingAmount)}</p>
                  <p className="text-sm text-gray-400 font-mono">
                    {formatAddress(order.data.makerAsset)}
                  </p>
                </div>

                <div className="bg-gray-700 rounded-lg p-4">
                  <h4 className="font-medium text-blue-400 mb-2">Taking (Buy)</h4>
                  <p className="text-2xl font-bold">{formatAmount(order.data.takingAmount)}</p>
                  <p className="text-sm text-gray-400 font-mono">
                    {formatAddress(order.data.takerAsset)}
                  </p>
                </div>

                <div className="bg-gray-700 rounded-lg p-4">
                  <h4 className="font-medium text-yellow-400 mb-2">Remaining Amount</h4>
                  <p className="text-2xl font-bold">{formatAmount(order.remainingMakerAmount)}</p>
                  <p className="text-sm text-gray-400">
                    {(
                      (Number(order.remainingMakerAmount) / Number(order.data.makingAmount)) *
                      100
                    ).toFixed(2)}
                    % remaining
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-700">
          <h3 className="text-lg font-semibold mb-3">Signature</h3>
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="font-mono text-sm break-all text-gray-300">{order.signature}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
