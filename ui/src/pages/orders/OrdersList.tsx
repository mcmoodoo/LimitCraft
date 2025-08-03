import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useChainId } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Progress } from '../../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { navigationHelpers } from '../../router/navigation';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  ArrowRight,
  ArrowUpDown,
  Calendar,
  User,
  Wallet,
  TrendingUp,
  Sparkles,
  Plus,
  Filter,
  RefreshCw,
  Eye
} from 'lucide-react';
import { cn } from '../../lib/utils';

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

// Common token registry (example for chain ID: 42161)
const COMMON_TOKENS: Record<number, Record<string, TokenInfo>> = {
  42161: {
    // Chain-specific tokens
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': {
      symbol: 'USDC.e',
      name: 'USD Coin',
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
    '0x912ce59144191c1204e64559fe8253a0e49e6548': { symbol: 'ARB', name: 'ARB Token', decimals: 18 },
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
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'filled' | 'cancelled' | 'expired'>('all');

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

      // Default fallback
      const defaultTokenInfo: TokenInfo = {
        symbol: `${normalizedAddress.slice(0, 6)}...${normalizedAddress.slice(-4)}`,
        name: 'Unknown Token',
        decimals: 18,
      };

      setTokenCache((prev) => ({ ...prev, [normalizedAddress]: defaultTokenInfo }));
      return defaultTokenInfo;
    },
    [tokenCache, chainId]
  );

  const fetchOrders = useCallback(async () => {
    if (!isConnected || !address) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

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

  const getStatusConfig = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          label: 'Pending',
          color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
          progress: 0
        };
      case 'filled':
        return {
          icon: CheckCircle,
          label: 'Filled',
          color: 'bg-green-500/10 text-green-500 border-green-500/20',
          progress: 100
        };
      case 'cancelled':
        return {
          icon: XCircle,
          label: 'Cancelled',
          color: 'bg-red-500/10 text-red-500 border-red-500/20',
          progress: 0
        };
      case 'expired':
        return {
          icon: AlertCircle,
          label: 'Expired',
          color: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
          progress: 0
        };
      default:
        return {
          icon: AlertCircle,
          label: 'Unknown',
          color: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
          progress: 0
        };
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

  const filteredOrders = orders.filter(order => 
    activeFilter === 'all' || order.status === activeFilter
  );

  const orderStats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    filled: orders.filter(o => o.status === 'filled').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
    expired: orders.filter(o => o.status === 'expired').length,
  };

  if (!isConnected) {
    return (
      <div className="relative min-h-screen">
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/10 via-gray-900 to-purple-900/10" />
        
        <div className="relative max-w-6xl mx-auto px-4 py-20">
          <div className="text-center">
            <div className="mb-8">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center">
                <Wallet className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                Your Orders
              </h1>
              <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
                Track all your limit orders in one beautiful dashboard
              </p>
            </div>
            
            <Card className="max-w-md mx-auto bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                  Wallet Not Connected
                </CardTitle>
                <CardDescription>
                  Connect your wallet to view and manage your orders
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <Button 
                      onClick={openConnectModal}
                      className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                    >
                      <Wallet className="mr-2 w-4 h-4" />
                      Connect Wallet
                    </Button>
                  )}
                </ConnectButton.Custom>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Skeleton className="h-10 w-48 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20">
        <Card className="max-w-md mx-auto bg-red-900/20 border-red-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-400">
              <XCircle className="w-5 h-5" />
              Error Loading Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-300 mb-4">{error}</p>
            <Button 
              onClick={fetchOrders} 
              variant="outline" 
              className="w-full border-red-500 text-red-400 hover:bg-red-500/10"
            >
              <RefreshCw className="mr-2 w-4 h-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="relative min-h-screen">
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/5 via-gray-900 to-purple-900/5" />
        
        <div className="relative max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  Your Orders
                </h1>
                <p className="text-gray-400">
                  Manage and track your limit orders across all supported protocols
                </p>
              </div>
              
              <div className="flex gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      onClick={fetchOrders} 
                      variant="outline" 
                      size="sm"
                      className="border-gray-700"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh orders</TooltipContent>
                </Tooltip>
                
                <Button asChild className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600">
                  <Link to={navigationHelpers.toCreateOrder()}>
                    <Plus className="mr-2 w-4 h-4" />
                    New Order
                  </Link>
                </Button>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-400">Total</span>
                  </div>
                  <p className="text-2xl font-bold">{orderStats.total}</p>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-gray-400">Pending</span>
                  </div>
                  <p className="text-2xl font-bold text-yellow-500">{orderStats.pending}</p>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-gray-400">Filled</span>
                  </div>
                  <p className="text-2xl font-bold text-green-500">{orderStats.filled}</p>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-gray-400">Cancelled</span>
                  </div>
                  <p className="text-2xl font-bold text-red-500">{orderStats.cancelled}</p>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-gray-500" />
                    <span className="text-sm text-gray-400">Expired</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-500">{orderStats.expired}</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="text-center py-20">
              <Card className="max-w-md mx-auto bg-gray-900/50 border-gray-800">
                <CardContent className="p-12">
                  <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-2xl flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">No Orders Yet</h3>
                  <p className="text-gray-400 mb-6">
                    You haven't created any orders yet. Start crafting your perfect trade!
                  </p>
                  <Button asChild className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600">
                    <Link to={navigationHelpers.toCreateOrder()}>
                      <Plus className="mr-2 w-4 h-4" />
                      Create Your First Order
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            <>
              {/* Filter Tabs */}
              <Tabs value={activeFilter} onValueChange={(value: any) => setActiveFilter(value)} className="mb-6">
                <TabsList className="grid w-full grid-cols-5 bg-gray-900/50">
                  <TabsTrigger value="all">All ({orderStats.total})</TabsTrigger>
                  <TabsTrigger value="pending">Pending ({orderStats.pending})</TabsTrigger>
                  <TabsTrigger value="filled">Filled ({orderStats.filled})</TabsTrigger>
                  <TabsTrigger value="cancelled">Cancelled ({orderStats.cancelled})</TabsTrigger>
                  <TabsTrigger value="expired">Expired ({orderStats.expired})</TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Orders List */}
              <div className="space-y-4">
                {filteredOrders.map((order) => {
                  const statusConfig = getStatusConfig(order.status);
                  const StatusIcon = statusConfig.icon;
                  
                  return (
                    <Card 
                      key={order.orderHash}
                      className="bg-gray-900/50 border-gray-800 hover:border-gray-700 transition-all duration-200 hover:-translate-y-1 group"
                    >
                      <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                          <div className="flex items-center gap-4">
                            <div className="flex-shrink-0">
                              <Badge className={cn("gap-2 px-3 py-1", statusConfig.color)}>
                                <StatusIcon className="w-3 h-3" />
                                {statusConfig.label}
                              </Badge>
                            </div>
                            
                            <div>
                              <h3 className="font-semibold text-lg">
                                Order #{formatAddress(order.orderHash)}
                              </h3>
                              <div className="flex items-center gap-4 text-sm text-gray-400">
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {formatAddress(order.data.maker)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {new Date(order.createDateTime).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <Button 
                            variant="outline" 
                            asChild 
                            className="border-gray-700 hover:bg-gray-800 group-hover:border-emerald-500/50"
                          >
                            <Link to={navigationHelpers.toOrderDetails(order.orderHash)}>
                              <Eye className="mr-2 w-4 h-4" />
                              View Details
                              <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </Link>
                          </Button>
                        </div>

                        {/* Progress Bar for Filled Orders */}
                        {order.status === 'filled' && (
                          <div className="mb-4">
                            <div className="flex justify-between text-sm mb-2">
                              <span className="text-gray-400">Progress</span>
                              <span className="text-green-400">100% Filled</span>
                            </div>
                            <Progress value={100} className="h-2" />
                          </div>
                        )}

                        {/* Order Details */}
                        <div className="grid md:grid-cols-2 gap-6">
                          {/* You Pay */}
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                              <ArrowUpDown className="w-4 h-4" />
                              You Pay
                            </div>
                            <Card className="bg-gray-800/50 border-gray-700">
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="text-lg font-semibold">
                                      {formatAmount(order.data.makingAmount, order.data.makerAsset)}
                                    </div>
                                    <div className="text-sm text-gray-400">
                                      {getTokenDisplay(order.data.makerAsset).symbol}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-xs text-gray-500">
                                      {getTokenDisplay(order.data.makerAsset).name}
                                    </div>
                                    <div className="text-xs text-gray-600 font-mono">
                                      {formatAddress(order.data.makerAsset)}
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>

                          {/* You Get */}
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-cyan-400 text-sm font-medium">
                              <ArrowUpDown className="w-4 h-4 rotate-180" />
                              You Get
                            </div>
                            <Card className="bg-gray-800/50 border-gray-700">
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="text-lg font-semibold">
                                      {formatAmount(order.data.takingAmount, order.data.takerAsset)}
                                    </div>
                                    <div className="text-sm text-gray-400">
                                      {getTokenDisplay(order.data.takerAsset).symbol}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-xs text-gray-500">
                                      {getTokenDisplay(order.data.takerAsset).name}
                                    </div>
                                    <div className="text-xs text-gray-600 font-mono">
                                      {formatAddress(order.data.takerAsset)}
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>

                        {/* Order Issues */}
                        {order.orderInvalidReason && (
                          <Alert className="mt-4 border-red-500/50 bg-red-500/10">
                            <AlertCircle className="w-4 h-4" />
                            <AlertDescription>
                              <span className="font-semibold text-red-400">Order Issue:</span>{' '}
                              <span className="text-red-300">{order.orderInvalidReason}</span>
                            </AlertDescription>
                          </Alert>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}