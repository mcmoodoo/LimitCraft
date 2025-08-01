import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useChainId } from 'wagmi';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { navigationHelpers } from '../../router/navigation';

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

export default function OrdersList() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const fetchOrders = useCallback(async () => {
    // Don't fetch orders if wallet is not connected
    if (!isConnected || !address) {
      setOrders([]);
      setLoading(false);
      return;
    }

    try {
      const url = new URL(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/orders`
      );
      url.searchParams.append('maker', address);

      const response = await fetch(url.toString());
      const result = await response.json();

      if (result.success) {
        setOrders(result.data);

        // Pre-fetch token info for all unique token addresses
        const uniqueTokens = new Set<string>();
        result.data.forEach((order: Order) => {
          uniqueTokens.add(order.data.makerAsset.toLowerCase());
          uniqueTokens.add(order.data.takerAsset.toLowerCase());
        });

        // Fetch token info for all unique tokens
        Array.from(uniqueTokens).forEach(async (tokenAddress) => {
          await getTokenInfo(tokenAddress);
        });
      } else {
        setError(result.error);
      }
    } catch (_err) {
      setError('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, [isConnected, address, getTokenInfo]);

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
        return 'text-green-400 bg-green-900/20 border-green-500';
      case 'filled':
        return 'text-blue-400 bg-blue-900/20 border-blue-500';
      case 'cancelled':
        return 'text-red-400 bg-red-900/20 border-red-500';
      case 'expired':
        return 'text-yellow-400 bg-yellow-900/20 border-yellow-500';
      default:
        return 'text-gray-400 bg-gray-900/20 border-gray-500';
    }
  };

  const getStatusIcon = (order: Order) => {
    switch (order.status) {
      case 'pending':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Pending order">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      case 'filled':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Filled order">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'cancelled':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Cancelled order">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        );
      case 'expired':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Expired order">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Unknown order status">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
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
    (tokenAddress: string): { symbol: string; name: string } => {
      const normalizedAddress = tokenAddress.toLowerCase();
      const tokenInfo = tokenCache[normalizedAddress];

      if (tokenInfo) {
        return { symbol: tokenInfo.symbol, name: tokenInfo.name };
      }

      return { symbol: formatAddress(tokenAddress), name: 'Unknown Token' };
    },
    [tokenCache]
  );

  if (!isConnected) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-12">
          <h1 className="text-3xl font-bold mb-6">Orders</h1>
          <Alert className="bg-yellow-900/20 border-yellow-500 max-w-md mx-auto">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Warning">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.732 15.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <AlertDescription className="text-yellow-300">
              <span className="font-semibold text-yellow-400">Wallet Not Connected</span>
              <br />
              Please connect your wallet to view your orders.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Error">
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
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center mb-3">
        <h1 className="text-2xl font-bold">Orders</h1>
        <Button asChild className="ml-auto">
          <Link to={navigationHelpers.toCreateOrder()}>Create Order</Link>
        </Button>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12">
          <div className="bg-gray-800 rounded-lg p-8 max-w-md mx-auto">
            <svg
              className="w-16 h-16 text-gray-400 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-label="No orders"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-gray-400 text-lg mb-6">No orders found for your wallet</p>
            <Button asChild>
              <Link to={navigationHelpers.toCreateOrder()}>Create Your First Order</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-400">
              You have {orders.length} order{orders.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="grid gap-4">
            {orders.map((order) => (
              <div
                key={order.orderHash}
                className="bg-gray-800 rounded-lg border border-gray-600 hover:border-gray-500 transition-all duration-200 hover:shadow-lg"
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <div
                          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(order)}`}
                        >
                          {getStatusIcon(order)}
                          {getStatusText(order)}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-1">
                          Order #{formatAddress(order.orderHash)}
                        </h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-label="Maker address"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                              />
                            </svg>
                            {formatAddress(order.data.maker)}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-label="Creation date"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            {new Date(order.createDateTime).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={navigationHelpers.toOrderDetails(order.orderHash)}>
                        View Details
                        <svg
                          className="w-4 h-4 ml-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-label="Arrow right"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </Link>
                    </Button>
                  </div>

                  <div className="border border-gray-600 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-label="You pay"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 14l-7 7m0 0l-7-7m7 7V3"
                            />
                          </svg>
                          You pay
                        </div>
                        <div className="bg-gray-700 rounded-lg p-3">
                          <div className="text-lg font-semibold text-white mb-1">
                            {formatAmount(order.data.makingAmount, order.data.makerAsset)}{' '}
                            {getTokenDisplay(order.data.makerAsset).symbol}
                          </div>
                          <div className="text-xs text-gray-400">
                            {getTokenDisplay(order.data.makerAsset).name}
                          </div>
                          <div className="text-xs text-gray-500 font-mono">
                            {formatAddress(order.data.makerAsset)}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-blue-400 text-sm font-medium">
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-label="You get"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 10l7-7m0 0l7 7m-7-7v18"
                            />
                          </svg>
                          You get
                        </div>
                        <div className="bg-gray-700 rounded-lg p-3">
                          <div className="text-lg font-semibold text-white mb-1">
                            {formatAmount(order.data.takingAmount, order.data.takerAsset)}{' '}
                            {getTokenDisplay(order.data.takerAsset).symbol}
                          </div>
                          <div className="text-xs text-gray-400">
                            {getTokenDisplay(order.data.takerAsset).name}
                          </div>
                          <div className="text-xs text-gray-500 font-mono">
                            {formatAddress(order.data.takerAsset)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {order.orderInvalidReason && (
                      <Alert variant="destructive" className="mt-4">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-label="Order issue"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <AlertDescription>
                          <span className="font-semibold">Order Issue:</span>{' '}
                          {order.orderInvalidReason}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
