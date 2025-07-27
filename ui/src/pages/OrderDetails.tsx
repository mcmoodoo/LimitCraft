import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

interface OrderDetails {
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
  const [filling, setFilling] = useState(false);
  const [fillResult, setFillResult] = useState<{ success: boolean; message: string; txHash?: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState<{ success: boolean; message: string } | null>(null);

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

  const getStatusColor = (order: OrderDetails) => {
    switch (order.status) {
      case 'pending':
        return 'text-green-400 bg-green-900/20';
      case 'filled':
        return 'text-blue-400 bg-blue-900/20';
      case 'cancelled':
        return 'text-red-400 bg-red-900/20';
      case 'expired':
        return 'text-yellow-400 bg-yellow-900/20';
      default:
        return 'text-gray-400 bg-gray-900/20';
    }
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

  const fillOrder = async () => {
    if (!orderHash) return;
    
    setFilling(true);
    setFillResult(null);
    
    try {
      const response = await fetch(`http://localhost:3000/order/${orderHash}/fill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      console.log('Fill result:', result); // Debug log
      setFillResult({
        success: result.success,
        message: result.success ? result.message : result.error,
        txHash: result.txHash
      });
      
      // If successful, refresh the order to update status
      if (result.success) {
        setTimeout(() => {
          fetchOrder();
        }, 1000);
      }
    } catch (err) {
      setFillResult({
        success: false,
        message: 'Failed to fill order: Network error'
      });
    } finally {
      setFilling(false);
    }
  };

  const canFillOrder = (order: OrderDetails) => {
    return order.status === 'pending';
  };

  const cancelOrder = async () => {
    if (!orderHash) return;
    
    setCancelling(true);
    setCancelResult(null);
    
    try {
      const response = await fetch(`http://localhost:3000/order/${orderHash}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      console.log('Cancel result:', result); // Debug log
      setCancelResult({
        success: result.success,
        message: result.success ? result.message : result.error,
      });
      
      // If successful, refresh the order to update status
      if (result.success) {
        setTimeout(() => {
          fetchOrder();
        }, 1000);
      }
    } catch (err) {
      setCancelResult({
        success: false,
        message: 'Failed to cancel order: Network error'
      });
    } finally {
      setCancelling(false);
    }
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

        {/* Resolver Profitability Section */}
        <div className="mt-6 pt-6 border-t border-gray-700">
          <h3 className="text-lg font-semibold mb-3">Resolver Analysis</h3>
          <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 rounded-lg p-6 border border-purple-500/20">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-lg font-medium text-purple-300 mb-1">
                  🤖 Resolver Profitability
                </h4>
                <p className="text-sm text-gray-400">
                  Analysis for resolver: 0xf39F...2266
                </p>
              </div>
              {canFillOrder(order) && (
                <div className="flex space-x-3">
                  <button
                    onClick={fillOrder}
                    disabled={filling || cancelling}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                      filling || cancelling
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {filling ? '⏳ Filling...' : '🚀 Fill Order'}
                  </button>
                  
                  <button
                    onClick={cancelOrder}
                    disabled={filling || cancelling}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                      filling || cancelling
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    {cancelling ? '⏳ Cancelling...' : '❌ Cancel Order'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-1">Estimated Profit</div>
                <div className="text-xl font-bold text-green-400">
                  +0.0245 ETH
                </div>
                <div className="text-xs text-gray-500">~$82.50 USD</div>
              </div>
              
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-1">Gas Cost</div>
                <div className="text-xl font-bold text-yellow-400">
                  ~0.0021 ETH
                </div>
                <div className="text-xs text-gray-500">~$7.10 USD</div>
              </div>
              
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-1">Net Profit</div>
                <div className="text-xl font-bold text-blue-400">
                  +0.0224 ETH
                </div>
                <div className="text-xs text-gray-500">~$75.40 USD</div>
              </div>
            </div>

            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
                <span className="text-green-400">Profitable</span>
              </div>
              <div className="text-gray-400">
                ROI: <span className="text-white font-medium">1,067%</span>
              </div>
              <div className="text-gray-400">
                Profit Margin: <span className="text-white font-medium">91.4%</span>
              </div>
            </div>

            {!canFillOrder(order) && (
              <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-500/20 rounded-lg">
                <div className="flex items-center space-x-2">
                  <span className="text-yellow-400">⚠️</span>
                  <span className="text-yellow-200 text-sm">
                    Order cannot be filled - Status: {getStatusText(order)}
                  </span>
                </div>
              </div>
            )}

            {fillResult && (
              <div className={`mt-4 p-4 rounded-lg border ${
                fillResult.success 
                  ? 'bg-green-900/30 border-green-500/50' 
                  : 'bg-red-900/30 border-red-500/50'
              }`}>
                <div className="flex items-start space-x-3">
                  <span className={`text-xl ${fillResult.success ? 'text-green-400' : 'text-red-400'}`}>
                    {fillResult.success ? '✅' : '❌'}
                  </span>
                  <div className="flex-1">
                    <p className={`font-medium ${fillResult.success ? 'text-green-100' : 'text-red-100'}`}>
                      {fillResult.success ? 'Fill Successful!' : 'Fill Failed'}
                    </p>
                    <p className={`text-sm mt-1 ${fillResult.success ? 'text-green-200' : 'text-red-200'}`}>
                      {fillResult.message}
                    </p>
                    {fillResult.txHash && (
                      <div className="mt-3 p-2 bg-gray-800/50 rounded border">
                        <span className="text-gray-300 text-xs block mb-1">Transaction Hash:</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-blue-300 text-xs font-mono break-all">
                            {fillResult.txHash}
                          </span>
                          <button
                            onClick={() => copyToClipboard(fillResult.txHash!)}
                            className="text-blue-400 hover:text-blue-300 text-sm"
                            title="Copy transaction hash"
                          >
                            📋
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {cancelResult && (
              <div className={`mt-4 p-4 rounded-lg border ${
                cancelResult.success 
                  ? 'bg-orange-900/30 border-orange-500/50' 
                  : 'bg-red-900/30 border-red-500/50'
              }`}>
                <div className="flex items-start space-x-3">
                  <span className={`text-xl ${cancelResult.success ? 'text-orange-400' : 'text-red-400'}`}>
                    {cancelResult.success ? '🚫' : '❌'}
                  </span>
                  <div className="flex-1">
                    <p className={`font-medium ${cancelResult.success ? 'text-orange-100' : 'text-red-100'}`}>
                      {cancelResult.success ? 'Order Cancelled!' : 'Cancel Failed'}
                    </p>
                    <p className={`text-sm mt-1 ${cancelResult.success ? 'text-orange-200' : 'text-red-200'}`}>
                      {cancelResult.message}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
