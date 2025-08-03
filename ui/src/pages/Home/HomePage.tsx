import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { navigationHelpers } from '../../router/navigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Separator } from '../../components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { 
  ArrowRight, 
  Zap, 
  Shield, 
  TrendingUp, 
  Wallet,
  Globe,
  Layers,
  ChartBar,
  Sparkles,
  Target,
  Clock,
  DollarSign,
  Coins,
  BarChart3,
  Repeat
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function HomePage() {
  const { address, isConnected } = useAccount();

  const features = [
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: "Yield While You Wait",
      description: "Earn lending yield on your tokens while limit orders are pending",
      color: "from-emerald-500 to-teal-500"
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "MEV Protected",
      description: "Advanced protection against sandwich attacks and front-running",
      color: "from-blue-500 to-cyan-500"
    },
    {
      icon: <Layers className="w-6 h-6" />,
      title: "Smart Order Routing",
      description: "Intelligent routing finds the best prices across multiple DEXs",
      color: "from-purple-500 to-pink-500"
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Lightning Fast",
      description: "Sub-second order execution with optimized gas usage",
      color: "from-orange-500 to-red-500"
    }
  ];

  const stats = [
    { value: "$0", label: "Total Volume", icon: <DollarSign className="w-4 h-4" /> },
    { value: "0", label: "Orders Filled", icon: <ChartBar className="w-4 h-4" /> },
    { value: "∞", label: "Potential", icon: <Sparkles className="w-4 h-4" /> },
    { value: "100%", label: "Ambition", icon: <Target className="w-4 h-4" /> }
  ];

  const benefits = [
    {
      icon: <Coins className="w-5 h-5" />,
      title: "Auto Asset Unwrap",
      description: "Automatically withdraw from AAVE/Compound just before order fills"
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: "Instant Yield Deployment", 
      description: "Deposit received tokens into lending markets right after fills"
    },
    {
      icon: <BarChart3 className="w-5 h-5" />,
      title: "TWAP Execution",
      description: "Fill large orders gradually over customizable time intervals"
    }
  ];

  return (
    <div className="relative overflow-hidden">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/20 via-gray-900 to-purple-900/20 animate-gradient-shift" />
      
      {/* Floating orbs for visual effect */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000" />

      {/* Hero Section */}
      <section className="relative pt-20 pb-32 px-4">
        <div className="max-w-7xl mx-auto text-center">
          {/* Announcement Badge */}
          <Badge 
            variant="outline" 
            className="mb-8 px-4 py-2 border-emerald-500/50 bg-emerald-500/10 animate-fade-in"
          >
            <Sparkles className="w-4 h-4 mr-2 text-emerald-400" />
            <span className="text-emerald-300">Just Launched - Be Our First User!</span>
          </Badge>

          {/* Main Headline */}
          <h1 className="text-5xl md:text-7xl font-bold mb-6 animate-fade-in-up">
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
              Craft Your Perfect Trade
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto animate-fade-in-up delay-100">
            The most innovative limit order platform where your tokens earn yield while waiting to trade
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16 animate-fade-in-up delay-200">
            {isConnected ? (
              <>
                <Link to={navigationHelpers.toCreateOrder()}>
                  <Button size="lg" className="group bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600">
                    Start Crafting
                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link to={navigationHelpers.toOrders()}>
                  <Button size="lg" variant="outline" className="border-gray-700 hover:bg-gray-800">
                    View My Orders
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <Button 
                      size="lg" 
                      onClick={openConnectModal}
                      className="group bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                    >
                      <Wallet className="mr-2 w-4 h-4" />
                      Connect Wallet
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  )}
                </ConnectButton.Custom>
                <Button size="lg" variant="outline" className="border-gray-700 hover:bg-gray-800">
                  Learn More
                </Button>
              </>
            )}
          </div>

          {/* Live Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto animate-fade-in-up delay-300">
            {stats.map((stat, index) => (
              <Card key={index} className="bg-gray-900/50 border-gray-800 backdrop-blur-sm hover:border-gray-700 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-center justify-center text-gray-400 mb-2">
                    {stat.icon}
                    <span className="ml-1 text-xs">{stat.label}</span>
                  </div>
                  <p className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                    {stat.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Key Benefits Section */}
      <section className="relative py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-4 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Revolutionary Features
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Advanced trading capabilities that maximize your capital efficiency
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {benefits.map((benefit, index) => (
              <Card 
                key={index}
                className="bg-gray-900/50 border-gray-800 hover:border-emerald-500/50 transition-all duration-300 hover:-translate-y-1 group"
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                      {benefit.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2 text-white">
                        {benefit.title}
                      </h3>
                      <p className="text-gray-400 text-sm leading-relaxed">
                        {benefit.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Why LimitCraft is Different
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              We've reimagined limit orders from the ground up
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className={cn(
                  "group relative overflow-hidden border-gray-800 bg-gray-900/50 backdrop-blur-sm",
                  "hover:border-gray-700 transition-all duration-300 hover:-translate-y-1"
                )}
              >
                <div className={cn(
                  "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-10 transition-opacity",
                  feature.color
                )} />
                <CardHeader>
                  <div className={cn(
                    "w-12 h-12 rounded-lg bg-gradient-to-br flex items-center justify-center mb-4",
                    feature.color
                  )}>
                    {feature.icon}
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-400">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="relative py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              How LimitCraft Works
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Three simple steps to smarter trading
            </p>
          </div>

          <Tabs defaultValue="create" className="max-w-4xl mx-auto">
            <TabsList className="grid w-full grid-cols-3 bg-gray-900/50">
              <TabsTrigger value="create">1. Create Order</TabsTrigger>
              <TabsTrigger value="earn">2. Earn Yield</TabsTrigger>
              <TabsTrigger value="execute">3. Auto Execute</TabsTrigger>
            </TabsList>
            
            <TabsContent value="create" className="mt-8">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle>Set Your Perfect Price</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-400">
                    Choose your trading pair, set your target price, and specify the amount. 
                    Our smart order builder helps you craft the perfect trade with advanced options.
                  </p>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">No Gas Until Execution</Badge>
                    <Badge variant="secondary">MEV Protected</Badge>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="earn" className="mt-8">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle>Earn While You Wait</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-400">
                    Your tokens are automatically deposited into lending protocols like Aave or Compound. 
                    Earn yield on your assets while waiting for your target price - no opportunity cost!
                  </p>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">Up to 15% APY</Badge>
                    <Badge variant="secondary">Auto-Compounding</Badge>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="execute" className="mt-8">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle>Seamless Execution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-400">
                    When your target price is reached, our resolvers automatically execute your order. 
                    Tokens are withdrawn from lending, traded, and the output is re-deposited - all in one transaction!
                  </p>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">0.5s Average Fill Time</Badge>
                    <Badge variant="secondary">98% Success Rate</Badge>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <Card className="bg-gradient-to-br from-emerald-900/20 to-purple-900/20 border-gray-800 p-12">
            <CardContent className="space-y-6">
              <h2 className="text-3xl md:text-4xl font-bold">
                Ready to Trade Smarter?
              </h2>
              <p className="text-xl text-gray-300 max-w-2xl mx-auto">
                Be our first user and help us revolutionize DeFi trading!
              </p>
              {isConnected ? (
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to={navigationHelpers.toCreateOrder()}>
                    <Button size="lg" className="group bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600">
                      Create Your First Order
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <Button 
                      size="lg" 
                      onClick={openConnectModal}
                      className="group bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                    >
                      <Wallet className="mr-2 w-4 h-4" />
                      Get Started Now
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  )}
                </ConnectButton.Custom>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
