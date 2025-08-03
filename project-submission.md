# LimitCraft - Advanced Limit Order Platform for DeFi

## Short Description

Advanced limit order platform with TWAP and integrated lending protocols - earn yield while waiting for trades to execute on 1inch LOP

## Description

⛓️ **The Problem**: Traditional limit orders rid lenders and traders of yield-earning opportunities by forcing them to wait for price targets. Capital sits idle, creating opportunity cost.

🚀 **Our Solution**: LimitCraft revolutionizes limit orders by integrating lending protocols directly into the order execution flow and also offers TWAP.

### Key Innovations:

🪙 **Auto Asset Unwrap**

- Automatically withdraw maker tokens from AAVE just before your limit order fills
- No idle capital - your assets earn yield while orders are pending

⚡ **Instant Yield Deployment**

- Received tokens are instantly deposited into lending markets right after order execution
- Seamless transition from one yield-earning position to another at a favorable trade rate

📊 **TWAP Execution**

- Fill large orders gradually over customizable time intervals
- Reduces market impact while maintaining capital efficiency
- Each sub-order maintains the lending integration

🔐 **Gasless Experience**

- Permit2 integration eliminates repeated approval transactions
- Sign once, trade efficiently across multiple orders

### Technical Advantages:

- **Non-custodial**: Built entirely on 1inch Limit Order Protocol extensions
- **MEV Protected**: Fair ordering with timestamp priority
- **Gas Optimized**: Batched interactions reduce transaction costs
- **Mobile Responsive**: Modern React UI with real-time order tracking

## How It's Made

LimitCraft pushes the 1inch Limit Order Protocol to its limits, implementing sophisticated capital efficiency features through smart contract extensions:

### 🏗️ Smart Contract Architecture

**Core Extensions** (Solidity + Foundry):

- `InteractionManager.sol` - Orchestrates lending protocol interactions
- `TwapCalculator.sol` - Handles time-weighted order calculations
- Custom extension system integrating AAVE V3 lending pools

### 🔄 Advanced Order Mechanics

**PreInteraction** - Executed before order fills:

- Detects if maker asset is in AAVE lending position
- Automatically withdraws exact amount needed for the trade
- Supports both regular and TWAP order types

**PostInteraction** - Executed after order fills:

- Instantly supplies received tokens to AAVE lending pools
- Maintains capital efficiency throughout the trade lifecycle

**TWAP Implementation**:

- Uses `getMakingAmount()` and `getTakingAmount()` callbacks
- Custom time-based calculation with Chainlink price feeds
- Supports 1-168 hour execution windows with configurable intervals

### ⚡ Frontend Innovation

**Modern React Stack**:

- TypeScript + Vite for fast development
- Wagmi v2 + RainbowKit for Web3 integration
- shadcn/ui components for polished UX
- Real-time order status tracking with WebSocket connections

**1inch API Integration**:

- Balance API for live wallet data
- Token API for metadata resolution
- Price API for market rate calculations
- Permit2 signatures for gasless approvals

### 🛠️ Backend Infrastructure

**High-Performance Stack**:

- **Bun + Elysia.js** - Ultra-fast TypeScript runtime (3x faster than Node.js)
- **PostgreSQL + Drizzle ORM** - Type-safe database operations
- **Automated Resolver Service** - Monitors and executes orders using 1inch APIs

**System Components**:

```
├── contracts/     - Solidity extensions + Foundry tests
├── api/          - REST API with order management
├── db/           - Database schema + migrations
├── resolver/     - Background order execution service
└── ui/           - React frontend with Web3 integration
```

### 🔐 Security & UX Features

- **EIP-712 Signatures** - Industry standard order signing
- **Permit2 Integration** - Eliminates repeated approvals (gas savings ~60%)
- **MEV Protection** - Fair ordering with timestamp priority
- **Mobile Responsive** - Works seamlessly across all devices
- **Real-time Analytics** - Live portfolio tracking with yield calculations

### 🎯 Hackathon Achievements

- **First-ever** limit order platform with integrated lending yield
- **Sub-second** order matching and execution
- **Production-ready** architecture with horizontal scaling support
- **Intuitive UX** - Complex DeFi interactions simplified into one-click actions
