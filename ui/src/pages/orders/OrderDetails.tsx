import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useChainId } from 'wagmi';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { navigationHelpers } from '../../router/navigation';

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
  makerTraits?: string;
  extension?: string;
  chainId?: number;
  typedData?: any;
}

interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

// Common token registry for Arbitrum (chainId: 42161)
const COMMON_TOKENS: Record<number, Record<string, TokenInfo>> = {
  42161: {
    // Arbitrum
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': {
      symbol: 'USDC.e',
      name: 'USD Coin (Arb1)',
      decimals: 6,
    },
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': {
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
    },
    '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': {
      symbol: 'WBTC',
      name: 'Wrapped BTC',
      decimals: 8,
    },
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
    },
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': {
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
    },
    '0x17fc002b466eec40dae837fc4be5c67993ddbd6f': { symbol: 'FRAX', name: 'Frax', decimals: 18 },
    '0x912ce59144191c1204e64559fe8253a0e49e6548': { symbol: 'ARB', name: 'Arbitrum', decimals: 18 },
    '0xf97f4df75117a78c1a5a0dbb814af92458539fb4': {
      symbol: 'LINK',
      name: 'ChainLink Token',
      decimals: 18,
    },
    '0xfea7a6a0b346362bf88a9e4a88416b77a57d6c2a': {
      symbol: 'MIM',
      name: 'Magic Internet Money',
      decimals: 18,
    },
  },
};

export default function OrderDetails() {
  const { orderHash } = useParams<{ orderHash: string }>();
  const chainId = useChainId();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState<{ success: boolean; message: string } | null>(
    null
  );
  const [tokenCache, setTokenCache] = useState<Record<string, TokenInfo>>({});

  // Get token info from cache or common tokens
  const getTokenInfo = useCallback(
    async (tokenAddress: string): Promise<TokenInfo> => {
      const normalizedAddress = tokenAddress.toLowerCase();

      // Check cache first
      if (tokenCache[normalizedAddress]) {
        return tokenCache[normalizedAddress];
      }

      // Check common tokens registry
      const commonTokens = COMMON_TOKENS[chainId] || {};
      if (commonTokens[normalizedAddress]) {
        const tokenInfo = commonTokens[normalizedAddress];
        setTokenCache((prev) => ({ ...prev, [normalizedAddress]: tokenInfo }));
        return tokenInfo;
      }

      // Fetch from API as fallback
      try {
        const response = await fetch(
          `https://api.1inch.dev/token/v1.4/${chainId}/custom/${tokenAddress}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.REACT_APP_ONE_INCH_API_KEY || ''}`,
              accept: 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const tokenInfo: TokenInfo = {
            symbol: data.symbol || 'UNKNOWN',
            name: data.name || 'Unknown Token',
            decimals: data.decimals || 18,
            logoURI: data.logoURI,
          };
          setTokenCache((prev) => ({ ...prev, [normalizedAddress]: tokenInfo }));
          return tokenInfo;
        }
      } catch (error) {
        console.warn(`Failed to fetch token info for ${tokenAddress}:`, error);
      }

      // Default fallback
      const defaultInfo: TokenInfo = {
        symbol: 'UNKNOWN',
        name: 'Unknown Token',
        decimals: 18,
      };
      setTokenCache((prev) => ({ ...prev, [normalizedAddress]: defaultInfo }));
      return defaultInfo;
    },
    [chainId, tokenCache]
  );

  const fetchOrder = useCallback(async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/orders/${orderHash}`
      );
      const result = await response.json();

      if (result.success) {
        setOrder(result.data);

        // Pre-fetch token info for maker and taker assets
        if (result.data.data.makerAsset) {
          await getTokenInfo(result.data.data.makerAsset);
        }
        if (result.data.data.takerAsset) {
          await getTokenInfo(result.data.data.takerAsset);
        }
      } else {
        setError(result.error);
      }
    } catch (_err) {
      setError('Failed to fetch order details');
    } finally {
      setLoading(false);
    }
  }, [orderHash, getTokenInfo]);

  useEffect(() => {
    if (orderHash) {
      fetchOrder();
    }
  }, [orderHash, fetchOrder]);

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

  // Format amount with proper decimals
  const formatAmount = useCallback(
    (amount: string, tokenAddress: string): string => {
      const normalizedAddress = tokenAddress.toLowerCase();
      const tokenInfo = tokenCache[normalizedAddress];

      if (!tokenInfo) {
        // If we don't have token info yet, use 18 decimals as default
        const num = BigInt(amount);
        return (Number(num) / 1e18).toFixed(6);
      }

      const decimals = tokenInfo.decimals;
      const divisor = 10 ** decimals;
      const num = BigInt(amount);
      const result = Number(num) / divisor;

      // Format based on the size of the number
      if (result === 0) return '0';
      if (result < 0.000001) return '<0.000001';
      if (result < 1) return result.toFixed(Math.min(6, decimals));
      if (result < 1000) return result.toFixed(Math.min(4, decimals));
      if (result < 1000000) return `${(result / 1000).toFixed(2)}K`;
      return `${(result / 1000000).toFixed(2)}M`;
    },
    [tokenCache]
  );

  // Get token symbol and name
  const getTokenDisplay = useCallback(
    (tokenAddress: string): { symbol: string; name: string; logoURI?: string } => {
      const normalizedAddress = tokenAddress.toLowerCase();
      const tokenInfo = tokenCache[normalizedAddress];

      if (tokenInfo) {
        return { symbol: tokenInfo.symbol, name: tokenInfo.name, logoURI: tokenInfo.logoURI };
      }

      return { symbol: formatAddress(tokenAddress), name: 'Unknown Token' };
    },
    [tokenCache]
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const cancelOrder = async () => {
    if (!orderHash) return;

    setCancelling(true);
    setCancelResult(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/orders/${orderHash}/cancel`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

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
    } catch (_err) {
      setCancelResult({
        success: false,
        message: 'Failed to cancel order: Network error',
      });
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <Alert variant="destructive" className="max-w-md mx-auto mt-12">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <AlertDescription>
            <span className="font-semibold">Error</span>
            <br />
            {error}
          </AlertDescription>
        </Alert>
        <div className="text-center mt-6">
          <Button asChild variant="outline">
            <Link to={navigationHelpers.toOrders()}>← Back to Orders</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-12">
          <svg
            className="w-16 h-16 text-gray-400 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <p className="text-gray-400 text-lg mb-6">Order not found</p>
          <Button asChild>
            <Link to={navigationHelpers.toOrders()}>← Back to Orders</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Helper function to decode extension data
  const decodeExtension = (extensionHex: string) => {
    if (!extensionHex || extensionHex === '0x') return null;

    try {
      // Simple hex string decode for display purposes
      return {
        hex: extensionHex,
        length: extensionHex.length,
        data: extensionHex.slice(0, 100) + (extensionHex.length > 100 ? '...' : ''),
      };
    } catch {
      return { hex: extensionHex, data: 'Unable to decode' };
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center mb-3">
        <Button variant="outline" size="sm" asChild className="mr-4">
          <Link to={navigationHelpers.toOrders()}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Orders
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Order Details</h1>
      </div>

      {/* Header Card with Order Status and Basic Info */}
      <div className="bg-gray-800 rounded-lg border border-gray-600 p-6 mb-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Order #{formatAddress(order.orderHash)}
            </h2>
            <div className="flex items-center space-x-4">
              <div
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(order)}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {getStatusText(order)}
              </div>
              <span className="flex items-center gap-1 text-gray-400 text-sm">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                {new Date(order.createDateTime).toLocaleString()}
              </span>
            </div>
          </div>
          {order.orderInvalidReason && (
            <Alert variant="destructive" className="max-w-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <AlertDescription>
                <span className="font-semibold">Order Issue:</span>
                <br />
                {order.orderInvalidReason}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Token Trading Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Making & Taking Assets */}
          <div className="bg-gray-800 rounded-lg border border-gray-600 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                />
              </svg>
              Token Exchange
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Making (Sell) */}
              <div className="border border-gray-600 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-400 text-sm font-medium mb-3">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 14l-7 7m0 0l-7-7m7 7V3"
                    />
                  </svg>
                  You Sell
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {getTokenDisplay(order.data.makerAsset).logoURI && (
                      <img
                        src={getTokenDisplay(order.data.makerAsset).logoURI}
                        alt={getTokenDisplay(order.data.makerAsset).symbol}
                        className="w-6 h-6 rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <div>
                      <div className="text-2xl font-bold text-white">
                        {formatAmount(order.data.makingAmount, order.data.makerAsset)}{' '}
                        {getTokenDisplay(order.data.makerAsset).symbol}
                      </div>
                      <div className="text-sm text-gray-400">
                        {getTokenDisplay(order.data.makerAsset).name}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    {formatAddress(order.data.makerAsset)}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(order.data.makerAsset)}
                      className="ml-2 text-blue-400 hover:text-blue-300"
                    >
                      📋
                    </button>
                  </div>
                </div>
              </div>

              {/* Taking (Buy) */}
              <div className="border border-gray-600 rounded-lg p-4">
                <div className="flex items-center gap-2 text-blue-400 text-sm font-medium mb-3">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 10l7-7m0 0l7 7m-7-7v18"
                    />
                  </svg>
                  You Buy
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {getTokenDisplay(order.data.takerAsset).logoURI && (
                      <img
                        src={getTokenDisplay(order.data.takerAsset).logoURI}
                        alt={getTokenDisplay(order.data.takerAsset).symbol}
                        className="w-6 h-6 rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <div>
                      <div className="text-2xl font-bold text-white">
                        {formatAmount(order.data.takingAmount, order.data.takerAsset)}{' '}
                        {getTokenDisplay(order.data.takerAsset).symbol}
                      </div>
                      <div className="text-sm text-gray-400">
                        {getTokenDisplay(order.data.takerAsset).name}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    {formatAddress(order.data.takerAsset)}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(order.data.takerAsset)}
                      className="ml-2 text-blue-400 hover:text-blue-300"
                    >
                      📋
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Exchange Rate */}
            <div className="mt-4 p-3 bg-gray-700 rounded-lg">
              <Label className="text-sm font-medium text-gray-300">Exchange Rate</Label>
              <div className="text-lg font-semibold text-white mt-1">
                1 {getTokenDisplay(order.data.makerAsset).symbol} ={' '}
                {(
                  Number(
                    formatAmount(order.data.takingAmount, order.data.takerAsset).replace(
                      /[^\d.-]/g,
                      ''
                    )
                  ) /
                  Number(
                    formatAmount(order.data.makingAmount, order.data.makerAsset).replace(
                      /[^\d.-]/g,
                      ''
                    )
                  )
                ).toFixed(6)}{' '}
                {getTokenDisplay(order.data.takerAsset).symbol}
              </div>
            </div>
          </div>

          {/* Order Progress */}
          <div className="bg-gray-800 rounded-lg border border-gray-600 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4"
                />
              </svg>
              Order Progress
            </h3>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Total Amount</span>
                <span className="font-semibold text-white">
                  {formatAmount(order.data.makingAmount, order.data.makerAsset)}{' '}
                  {getTokenDisplay(order.data.makerAsset).symbol}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-400">Remaining</span>
                <span className="font-semibold text-white">
                  {formatAmount(order.remainingMakerAmount, order.data.makerAsset)}{' '}
                  {getTokenDisplay(order.data.makerAsset).symbol}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-400">Filled</span>
                <span className="font-semibold text-white">
                  {formatAmount(
                    (
                      BigInt(order.data.makingAmount) - BigInt(order.remainingMakerAmount)
                    ).toString(),
                    order.data.makerAsset
                  )}{' '}
                  {getTokenDisplay(order.data.makerAsset).symbol}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Progress</span>
                  <span className="text-white font-medium">
                    {(
                      ((Number(order.data.makingAmount) - Number(order.remainingMakerAmount)) /
                        Number(order.data.makingAmount)) *
                      100
                    ).toFixed(2)}
                    %
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${((Number(order.data.makingAmount) - Number(order.remainingMakerAmount)) / Number(order.data.makingAmount)) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Order Information Sidebar */}
        <div className="space-y-6">
          {/* Basic Order Info */}
          <div className="bg-gray-800 rounded-lg border border-gray-600 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Order Info
            </h3>

            <div className="space-y-3">
              <div>
                <Label className="text-xs text-gray-400">Order Hash</Label>
                <div className="flex items-center mt-1">
                  <span className="font-mono text-sm text-white">
                    {formatAddress(order.orderHash)}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(order.orderHash)}
                    className="ml-2 text-blue-400 hover:text-blue-300"
                  >
                    📋
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-xs text-gray-400">Maker</Label>
                <div className="flex items-center mt-1">
                  <span className="font-mono text-sm text-white">
                    {formatAddress(order.data.maker)}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(order.data.maker)}
                    className="ml-2 text-blue-400 hover:text-blue-300"
                  >
                    📋
                  </button>
                </div>
              </div>

              {order.data.taker && (
                <div>
                  <Label className="text-xs text-gray-400">Taker</Label>
                  <div className="flex items-center mt-1">
                    <span className="font-mono text-sm text-white">
                      {formatAddress(order.data.taker)}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(order.data.taker!)}
                      className="ml-2 text-blue-400 hover:text-blue-300"
                    >
                      📋
                    </button>
                  </div>
                </div>
              )}

              {order.data.receiver && (
                <div>
                  <Label className="text-xs text-gray-400">Receiver</Label>
                  <div className="flex items-center mt-1">
                    <span className="font-mono text-sm text-white">
                      {formatAddress(order.data.receiver)}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(order.data.receiver!)}
                      className="ml-2 text-blue-400 hover:text-blue-300"
                    >
                      📋
                    </button>
                  </div>
                </div>
              )}

              {order.data.salt && (
                <div>
                  <Label className="text-xs text-gray-400">Salt</Label>
                  <div className="mt-1">
                    <span className="font-mono text-sm text-white">
                      {formatAddress(order.data.salt)}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs text-gray-400">Chain ID</Label>
                <div className="mt-1">
                  <span className="text-sm text-white">{order.chainId || chainId}</span>
                </div>
              </div>

              <div>
                <Label className="text-xs text-gray-400">Is Maker Contract</Label>
                <div className="mt-1">
                  <span
                    className={`text-sm ${order.isMakerContract ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {order.isMakerContract ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Rates & Balance Info */}
          <div className="bg-gray-800 rounded-lg border border-gray-600 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 7h6m0 10v-3m-3-3h3m0 0V7.5a1.5 1.5 0 00-1.5-1.5H13.5a1.5 1.5 0 00-1.5 1.5v0"
                />
              </svg>
              Rates & Balance
            </h3>

            <div className="space-y-3">
              <div>
                <Label className="text-xs text-gray-400">Maker Rate</Label>
                <div className="mt-1">
                  <span className="text-sm font-semibold text-white">
                    {parseFloat(order.makerRate).toFixed(6)}
                  </span>
                </div>
              </div>

              <div>
                <Label className="text-xs text-gray-400">Taker Rate</Label>
                <div className="mt-1">
                  <span className="text-sm font-semibold text-white">
                    {parseFloat(order.takerRate).toFixed(6)}
                  </span>
                </div>
              </div>

              <div>
                <Label className="text-xs text-gray-400">Maker Balance</Label>
                <div className="mt-1">
                  <span className="text-sm text-white">
                    {formatAmount(order.makerBalance, order.data.makerAsset)}{' '}
                    {getTokenDisplay(order.data.makerAsset).symbol}
                  </span>
                </div>
              </div>

              <div>
                <Label className="text-xs text-gray-400">Maker Allowance</Label>
                <div className="mt-1">
                  <span className="text-sm text-white">
                    {formatAmount(order.makerAllowance, order.data.makerAsset)}{' '}
                    {getTokenDisplay(order.data.makerAsset).symbol}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Technical Details Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Maker Traits */}
        {order.makerTraits && (
          <div className="bg-gray-800 rounded-lg border border-gray-600 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Maker Traits
            </h3>
            <div className="bg-gray-900 rounded-lg p-4">
              <Label className="text-xs text-gray-400">Raw Data</Label>
              <p className="font-mono text-sm text-gray-300 break-all mt-1">{order.makerTraits}</p>
            </div>
          </div>
        )}

        {/* Extension Data */}
        {order.extension && decodeExtension(order.extension) && (
          <div className="bg-gray-800 rounded-lg border border-gray-600 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a1 1 0 01-1-1V9a1 1 0 011-1h1a2 2 0 100-4H4a1 1 0 01-1-1V4a1 1 0 011-1h3a1 1 0 011-1v1z"
                />
              </svg>
              Extension Data
            </h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-gray-400">Length</Label>
                <div className="mt-1">
                  <span className="text-sm text-white">
                    {decodeExtension(order.extension)?.length} characters
                  </span>
                </div>
              </div>
              <div className="bg-gray-900 rounded-lg p-4">
                <Label className="text-xs text-gray-400">Hex Data</Label>
                <p className="font-mono text-sm text-gray-300 break-all mt-1">
                  {decodeExtension(order.extension)?.data}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Signature Section */}
      <div className="bg-gray-800 rounded-lg border border-gray-600 p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Digital Signature
        </h3>
        <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <Label className="text-xs text-gray-400">Signature Hash</Label>
            <button
              type="button"
              onClick={() => copyToClipboard(order.signature)}
              className="text-blue-400 hover:text-blue-300 text-xs"
            >
              Copy Full Signature
            </button>
          </div>
          <p className="font-mono text-sm text-gray-300 break-all">{order.signature}</p>
        </div>
      </div>

      {/* TypedData Section (if available) */}
      {order.typedData && (
        <div className="bg-gray-800 rounded-lg border border-gray-600 p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            EIP-712 Typed Data
          </h3>
          <div className="bg-gray-900 rounded-lg p-4">
            <pre className="text-sm text-gray-300 overflow-x-auto">
              {JSON.stringify(order.typedData, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Resolver Profitability Section */}
      <div className="bg-gray-800 rounded-lg border border-gray-600 p-6">
        <h3 className="text-lg font-semibold mb-3">Resolver Analysis</h3>
        <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 rounded-lg p-6 border border-purple-500/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-lg font-medium text-purple-300 mb-1">
                🤖 Resolver Profitability
              </h4>
              <p className="text-sm text-gray-400">Analysis for resolver: 0xf39F...2266</p>
            </div>
            {order.status === 'pending' && (
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={cancelOrder}
                  disabled={cancelling}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    cancelling
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
              <div className="text-xl font-bold text-green-400">+0.0245 ETH</div>
              <div className="text-xs text-gray-500">~$82.50 USD</div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">Gas Cost</div>
              <div className="text-xl font-bold text-yellow-400">~0.0021 ETH</div>
              <div className="text-xs text-gray-500">~$7.10 USD</div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">Net Profit</div>
              <div className="text-xl font-bold text-blue-400">+0.0224 ETH</div>
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

          {order.status !== 'pending' && (
            <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-500/20 rounded-lg">
              <div className="flex items-center space-x-2">
                <span className="text-yellow-400">⚠️</span>
                <span className="text-yellow-200 text-sm">
                  Order Status: {getStatusText(order)}
                </span>
              </div>
            </div>
          )}

          {cancelResult && (
            <div
              className={`mt-4 p-4 rounded-lg border ${
                cancelResult.success
                  ? 'bg-orange-900/30 border-orange-500/50'
                  : 'bg-red-900/30 border-red-500/50'
              }`}
            >
              <div className="flex items-start space-x-3">
                <span
                  className={`text-xl ${cancelResult.success ? 'text-orange-400' : 'text-red-400'}`}
                >
                  {cancelResult.success ? '🚫' : '❌'}
                </span>
                <div className="flex-1">
                  <p
                    className={`font-medium ${cancelResult.success ? 'text-orange-100' : 'text-red-100'}`}
                  >
                    {cancelResult.success ? 'Order Cancelled!' : 'Cancel Failed'}
                  </p>
                  <p
                    className={`text-sm mt-1 ${cancelResult.success ? 'text-orange-200' : 'text-red-200'}`}
                  >
                    {cancelResult.message}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
