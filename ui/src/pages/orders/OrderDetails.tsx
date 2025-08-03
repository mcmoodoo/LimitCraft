import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useChainId } from 'wagmi';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Progress } from '../../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { navigationHelpers } from '../../router/navigation';
import { 
  ArrowLeft,
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  ArrowUpDown,
  Calendar,
  User,
  Hash,
  Copy,
  ExternalLink,
  TrendingUp,
  DollarSign,
  Activity,
  Shield,
  Code,
  FileText,
  Bot,
  Zap,
  AlertTriangle
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface OrderDetails {
  orderHash: string;
  createDateTime: string;
  remainingMakerAmount: string;
  makerBalance: string;
  makerAllowance: string;
  status: 'pending' | 'filled' | 'cancelled' | 'expired' | 'partialFilled';
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
  number_of_orders?: number;
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

export default function OrderDetails() {
  const { orderHash } = useParams<{ orderHash: string }>();
  const chainId = useChainId();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState<{ success: boolean; message: string } | null>(null);
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

  const fetchOrder = useCallback(async () => {
    if (!orderHash) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/orders/${orderHash}`
      );
      const result = await response.json();

      if (result.success) {
        setOrder(result.data);

        // Pre-fetch token info
        await getTokenInfo(result.data.data.makerAsset);
        await getTokenInfo(result.data.data.takerAsset);
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
    fetchOrder();
  }, [fetchOrder]);

  const getStatusConfig = (status: OrderDetails['status']) => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          label: 'Pending',
          color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
          bgColor: 'from-yellow-900/20 to-yellow-800/10'
        };
      case 'filled':
        return {
          icon: CheckCircle,
          label: 'Filled',
          color: 'bg-green-500/10 text-green-500 border-green-500/20',
          bgColor: 'from-green-900/20 to-green-800/10'
        };
      case 'cancelled':
        return {
          icon: XCircle,
          label: 'Cancelled',
          color: 'bg-red-500/10 text-red-500 border-red-500/20',
          bgColor: 'from-red-900/20 to-red-800/10'
        };
      case 'expired':
        return {
          icon: AlertCircle,
          label: 'Expired',
          color: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
          bgColor: 'from-gray-900/20 to-gray-800/10'
        };
      case 'partialFilled':
        return {
          icon: CheckCircle,
          label: 'Partial Fill',
          color: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
          bgColor: 'from-orange-900/20 to-orange-800/10'
        };
      default:
        return {
          icon: AlertCircle,
          label: 'Unknown',
          color: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
          bgColor: 'from-gray-900/20 to-gray-800/10'
        };
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatAmount = useCallback(
    (amount: string, tokenAddress: string): string => {
      const normalizedAddress = tokenAddress.toLowerCase();
      const tokenInfo = tokenCache[normalizedAddress];

      if (!tokenInfo) {
        // If we don't have token info yet, use 18 decimals as default
        const num = BigInt(amount);
        const divisor = BigInt(10 ** 18);
        const quotient = num / divisor;
        const remainder = num % divisor;
        
        if (remainder === 0n) {
          return quotient.toString();
        }
        
        const remainderStr = remainder.toString().padStart(18, '0');
        const trimmedRemainder = remainderStr.replace(/0+$/, '');
        return `${quotient}.${trimmedRemainder}`;
      }

      const decimals = tokenInfo.decimals;
      const num = BigInt(amount);
      const divisor = BigInt(10 ** decimals);
      const quotient = num / divisor;
      const remainder = num % divisor;

      if (remainder === 0n) {
        return quotient.toString();
      }

      const remainderStr = remainder.toString().padStart(decimals, '0');
      const trimmedRemainder = remainderStr.replace(/0+$/, '');
      return `${quotient}.${trimmedRemainder}`;
    },
    [tokenCache]
  );

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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
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
      setCancelResult({
        success: result.success,
        message: result.success ? result.message : result.error,
      });

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
      <div className="relative min-h-screen">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/5 via-gray-900 to-purple-900/5" />
        <div className="relative max-w-6xl mx-auto px-4 py-8">
          <div className="mb-8">
            <Skeleton className="h-8 w-32 mb-4" />
            <Skeleton className="h-12 w-96 mb-6" />
            <Skeleton className="h-48 mb-6" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-64" />
              <Skeleton className="h-48" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-32" />
              <Skeleton className="h-48" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative min-h-screen">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/5 via-gray-900 to-purple-900/5" />
        <div className="relative max-w-6xl mx-auto px-4 py-20">
          <Card className="max-w-md mx-auto bg-red-900/20 border-red-500/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-400">
                <XCircle className="w-5 h-5" />
                Error Loading Order
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-red-300">{error}</p>
              <div className="flex gap-3">
                <Button 
                  onClick={fetchOrder} 
                  variant="outline" 
                  className="flex-1 border-red-500 text-red-400 hover:bg-red-500/10"
                >
                  Try Again
                </Button>
                <Button asChild variant="outline" className="flex-1">
                  <Link to={navigationHelpers.toOrders()}>
                    <ArrowLeft className="mr-2 w-4 h-4" />
                    Back
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="relative min-h-screen">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/5 via-gray-900 to-purple-900/5" />
        <div className="relative max-w-6xl mx-auto px-4 py-20">
          <Card className="max-w-md mx-auto bg-gray-900/50 border-gray-800">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-gray-500/20 to-gray-600/20 rounded-2xl flex items-center justify-center">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Order Not Found</h3>
              <p className="text-gray-400 mb-6">
                The order you're looking for doesn't exist or has been removed.
              </p>
              <Button asChild className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600">
                <Link to={navigationHelpers.toOrders()}>
                  <ArrowLeft className="mr-2 w-4 h-4" />
                  Back to Orders
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(order.status);
  const StatusIcon = statusConfig.icon;
  const fillPercentage = ((Number(order.data.makingAmount) - Number(order.remainingMakerAmount)) / Number(order.data.makingAmount)) * 100;

  return (
    <TooltipProvider>
      <div className="relative min-h-screen">
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/5 via-gray-900 to-purple-900/5" />
        
        <div className="relative max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <Button variant="outline" asChild className="border-gray-700">
                <Link to={navigationHelpers.toOrders()}>
                  <ArrowLeft className="mr-2 w-4 h-4" />
                  Back to Orders
                </Link>
              </Button>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold">Order Details</h1>
                  {order.number_of_orders != null && (
                    <Badge className="gap-2 px-3 py-1 bg-purple-900/30 text-purple-300 border border-purple-500/30">
                      <Zap className="w-4 h-4" />
                      TWAP Order
                      {order.number_of_orders && (
                        <span className="text-xs bg-purple-800/50 px-1.5 py-0.5 rounded">
                          {order.number_of_orders} orders
                        </span>
                      )}
                    </Badge>
                  )}
                </div>
                <p className="text-gray-400">#{formatAddress(order.orderHash)}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Badge className={cn("gap-2 px-4 py-2", statusConfig.color)}>
                <StatusIcon className="w-4 h-4" />
                {statusConfig.label}
              </Badge>
              {order.status === 'pending' && (
                <Button 
                  onClick={cancelOrder}
                  disabled={cancelling}
                  variant="outline"
                  className="border-red-500 text-red-400 hover:bg-red-500/10"
                >
                  {cancelling ? 'Cancelling...' : 'Cancel Order'}
                </Button>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Left Column - Main Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Order Overview */}
              <Card className={cn("border-gray-800 bg-gradient-to-br", statusConfig.bgColor)}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowUpDown className="w-5 h-5" />
                    Trade Overview
                  </CardTitle>
                  <CardDescription>
                    Created on {new Date(order.createDateTime).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* You Pay */}
                    <div>
                      <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium mb-3">
                        <ArrowUpDown className="w-4 h-4" />
                        You Pay
                      </div>
                      <Card className="bg-gray-800/50 border-gray-700">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-full flex items-center justify-center">
                              <span className="text-emerald-400 font-bold text-sm">
                                {getTokenDisplay(order.data.makerAsset).symbol.slice(0, 3)}
                              </span>
                            </div>
                            <div className="flex-1">
                              <div className="text-xl font-bold">
                                {formatAmount(order.data.makingAmount, order.data.makerAsset)}
                              </div>
                              <div className="text-sm text-gray-400">
                                {getTokenDisplay(order.data.makerAsset).symbol}
                              </div>
                              <div className="text-xs text-gray-500">
                                {getTokenDisplay(order.data.makerAsset).name}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* You Get */}
                    <div>
                      <div className="flex items-center gap-2 text-cyan-400 text-sm font-medium mb-3">
                        <ArrowUpDown className="w-4 h-4 rotate-180" />
                        You Get
                      </div>
                      <Card className="bg-gray-800/50 border-gray-700">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-full flex items-center justify-center">
                              <span className="text-cyan-400 font-bold text-sm">
                                {getTokenDisplay(order.data.takerAsset).symbol.slice(0, 3)}
                              </span>
                            </div>
                            <div className="flex-1">
                              <div className="text-xl font-bold">
                                {formatAmount(order.data.takingAmount, order.data.takerAsset)}
                              </div>
                              <div className="text-sm text-gray-400">
                                {getTokenDisplay(order.data.takerAsset).symbol}
                              </div>
                              <div className="text-xs text-gray-500">
                                {getTokenDisplay(order.data.takerAsset).name}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Order Progress */}
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Order Progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Progress</span>
                    <span className="font-medium">{fillPercentage.toFixed(2)}% Filled</span>
                  </div>
                  <Progress value={fillPercentage} className="h-3" />
                  
                  <div className="grid grid-cols-3 gap-4 pt-4">
                    <div className="text-center">
                      <div className="text-lg font-bold text-gray-300">
                        {formatAmount(order.data.makingAmount, order.data.makerAsset)}
                      </div>
                      <div className="text-xs text-gray-500">Total Amount</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-green-400">
                        {formatAmount((BigInt(order.data.makingAmount) - BigInt(order.remainingMakerAmount)).toString(), order.data.makerAsset)}
                      </div>
                      <div className="text-xs text-gray-500">Filled</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-yellow-400">
                        {formatAmount(order.remainingMakerAmount, order.data.makerAsset)}
                      </div>
                      <div className="text-xs text-gray-500">Remaining</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Exchange Rate */}
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Exchange Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <div className="text-2xl font-bold mb-2">
                      1 {getTokenDisplay(order.data.makerAsset).symbol} = {' '}
                      {(() => {
                        const takingAmount = parseFloat(formatAmount(order.data.takingAmount, order.data.takerAsset));
                        const makingAmount = parseFloat(formatAmount(order.data.makingAmount, order.data.makerAsset));
                        const rate = takingAmount / makingAmount;
                        return rate.toString();
                      })()} {getTokenDisplay(order.data.takerAsset).symbol}
                    </div>
                    <div className="text-sm text-gray-400">
                      Rate based on order amounts
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-6">
              {/* Order Information */}
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Hash className="w-5 h-5" />
                    Order Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Order Hash</div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm flex-1">{formatAddress(order.orderHash)}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => copyToClipboard(order.orderHash)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy full hash</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-400 mb-1">Maker</div>
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 text-gray-500" />
                      <span className="font-mono text-sm flex-1">{formatAddress(order.data.maker)}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => copyToClipboard(order.data.maker)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy address</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-400 mb-1">Chain ID</div>
                    <div className="text-sm">{order.chainId || chainId}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-400 mb-1">Is Contract</div>
                    <Badge variant={order.isMakerContract ? "default" : "secondary"}>
                      {order.isMakerContract ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Balance & Allowance */}
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Balance Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Maker Balance</div>
                    <div className="text-sm font-medium">
                      {formatAmount(order.makerBalance, order.data.makerAsset)} {getTokenDisplay(order.data.makerAsset).symbol}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Allowance</div>
                    <div className="text-sm font-medium">
                      {formatAmount(order.makerAllowance, order.data.makerAsset)} {getTokenDisplay(order.data.makerAsset).symbol}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-400 mb-1">Maker Rate</div>
                    <div className="text-sm font-medium">{parseFloat(order.makerRate).toFixed(6)}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-400 mb-1">Taker Rate</div>
                    <div className="text-sm font-medium">{parseFloat(order.takerRate).toFixed(6)}</div>
                  </div>
                </CardContent>
              </Card>

              {/* Order Issues */}
              {order.orderInvalidReason && (
                <Card className="bg-red-900/20 border-red-500/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-400">
                      <AlertTriangle className="w-5 h-5" />
                      Order Issue
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-red-300 text-sm">{order.orderInvalidReason}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Technical Details Tabs */}
          <Tabs defaultValue="technical" className="mb-6">
            <TabsList className="grid w-full grid-cols-4 bg-gray-900/50">
              <TabsTrigger value="technical">Technical</TabsTrigger>
              <TabsTrigger value="signature">Signature</TabsTrigger>
              <TabsTrigger value="typed-data">Typed Data</TabsTrigger>
              <TabsTrigger value="resolver">Resolver</TabsTrigger>
            </TabsList>

            <TabsContent value="technical" className="mt-6">
              <div className="grid md:grid-cols-2 gap-6">
                {order.makerTraits && (
                  <Card className="bg-gray-900/50 border-gray-800">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5" />
                        Maker Traits
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-gray-800 rounded-lg p-4">
                        <code className="text-sm text-gray-300 break-all">{order.makerTraits}</code>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {order.extension && (
                  <Card className="bg-gray-900/50 border-gray-800">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Code className="w-5 h-5" />
                        Extension Data
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-gray-800 rounded-lg p-4">
                        <div className="text-xs text-gray-400 mb-2">Length: {order.extension.length} chars</div>
                        <code className="text-sm text-gray-300 break-all">
                          {order.extension.slice(0, 100)}{order.extension.length > 100 ? '...' : ''}
                        </code>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="signature" className="mt-6">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Digital Signature
                  </CardTitle>
                  <CardDescription>
                    Cryptographic proof of order authorization
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-gray-400">Signature Hash</span>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => copyToClipboard(order.signature)}
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <code className="text-sm text-gray-300 break-all">{order.signature}</code>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="typed-data" className="mt-6">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    EIP-712 Typed Data
                  </CardTitle>
                  <CardDescription>
                    Structured data used for signature generation
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {order.typedData ? (
                    <div className="bg-gray-800 rounded-lg p-4">
                      <pre className="text-sm text-gray-300 overflow-x-auto">
                        {JSON.stringify(order.typedData, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      No typed data available for this order
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="resolver" className="mt-6">
              <Card className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-500/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-purple-300">
                    <Bot className="w-5 h-5" />
                    Resolver Analysis
                  </CardTitle>
                  <CardDescription>
                    Automated execution profitability analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-green-400 mb-1">+0.0245 ETH</div>
                      <div className="text-xs text-gray-400">Estimated Profit</div>
                      <div className="text-xs text-gray-500">~$82.50 USD</div>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-yellow-400 mb-1">0.0021 ETH</div>
                      <div className="text-xs text-gray-400">Gas Cost</div>
                      <div className="text-xs text-gray-500">~$7.10 USD</div>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-blue-400 mb-1">+0.0224 ETH</div>
                      <div className="text-xs text-gray-400">Net Profit</div>
                      <div className="text-xs text-gray-500">~$75.40 USD</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-400"></div>
                      <span className="text-green-400">Profitable</span>
                    </div>
                    <div className="text-gray-400">
                      ROI: <span className="text-white font-medium">1,067%</span>
                    </div>
                    <div className="text-gray-400">
                      Margin: <span className="text-white font-medium">91.4%</span>
                    </div>
                  </div>

                  {cancelResult && (
                    <Alert className={cn("mt-4", cancelResult.success ? "border-green-500/50 bg-green-500/10" : "border-red-500/50 bg-red-500/10")}>
                      <AlertCircle className="w-4 h-4" />
                      <AlertDescription>
                        <span className="font-semibold">
                          {cancelResult.success ? 'Order Cancelled!' : 'Cancel Failed'}
                        </span>
                        <br />
                        {cancelResult.message}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  );
}