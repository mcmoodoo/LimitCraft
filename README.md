> 純太さんのような優秀なエンジニアとチームを組めて、本当に感謝しています。これから一緒に素晴らしいものを作っていけるのが楽しみです。

# 🏮 1inch Limit Order - Arbitrum 🌸

A complete orderbook application for creating and managing 1inch limit orders on Arbitrum. Features include order creation, automated order filling, and a React frontend with Web3 wallet integration.

## 🏯 Project Structure

⛩️ **`api/`** - Elysia.js backend API for order management
⛩️ **`ui/`** - React frontend with RainbowKit wallet integration
⛩️ **`db/`** - PostgreSQL database layer with Drizzle ORM
⛩️ **`resolver/`** - Automated order resolver and filler
⛩️ **`scripts/`** - Utility scripts
⛩️ **`contracts/`** - Foundry smart contracts with 1inch integration

## 🏗️ Smart Contracts Setup

The `contracts/` folder contains Foundry-based smart contracts that integrate with the 1inch Limit Order Protocol.

### 🔧 Prerequisites for Contracts

🎋 [Foundry](https://book.getfoundry.sh/getting-started/installation) - Ethereum development toolkit
🎋 Git - For submodule dependencies

### 🚀 Contracts Quick Start

```bash
# Install Foundry (if not already installed)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Navigate to contracts directory
cd contracts

# Install dependencies (automatically pulls git submodules)
forge install

# Build contracts
forge build

# Run tests
forge test

# Run tests with verbose output
forge test -vv
```

### 📦 Dependencies

The contracts folder includes these key dependencies:

🌟 **1inch Limit Order Protocol** - Core limit order functionality
🌟 **OpenZeppelin Contracts** - Standard secure contract implementations  
🌟 **1inch Solidity Utils** - Utility libraries for 1inch integration

Dependencies are managed as git submodules in the **root** `lib/` directory:

```
lib/                           # ✅ GIT SUBMODULES (committed to git)
├── limit-order-protocol/      # 1inch Limit Order Protocol
├── openzeppelin-contracts/    # OpenZeppelin standard contracts
└── solidity-utils/           # 1inch utility libraries

contracts/lib/                 # ❌ LOCAL DEPENDENCIES (ignored by git)
└── forge-std/                # Foundry standard library (auto-installed)
```

**Important:** The root `lib/` contains git submodules that are committed, while `contracts/lib/` contains local Foundry dependencies that are ignored by git.

### 🏗️ Contracts Structure

```
contracts/
├── src/                      # Smart contract source files
│   ├── InteractionMock.sol   # Mock contract for pre/post interactions
│   └── Counter.sol           # Example contract
├── test/                     # Contract tests
│   ├── InteractionMock.t.sol # Comprehensive tests for InteractionMock
│   └── Counter.t.sol         # Example test
├── script/                   # Deployment scripts
├── lib/                      # ❌ Local Foundry deps (gitignored)
│   └── forge-std/           # Testing framework
├── foundry.toml             # Foundry configuration
└── README.md                # Contracts-specific documentation
```

### 🧪 Testing

The contracts include comprehensive tests using Foundry's testing framework:

```bash
cd contracts

# Run all tests
forge test

# Run specific test contract
forge test --match-contract InteractionMockTest

# Run with gas reporting
forge test --gas-report

# Run with coverage
forge coverage
```

**InteractionMock Tests Include:**

- ✅ Function validation tests
- ✅ Error condition testing
- ✅ Fuzz testing for edge cases
- ✅ Integration with 1inch types

## 📋 Prerequisites

🎋 Bun runtime
🎋 Node.js (for package compatibility)
🎋 Podman or Docker (for PostgreSQL)
🎋 Just command runner (optional, for database recipes)

## 🚀 Quick Start

### 1️⃣ Database Setup 🗄️

Create and start a local PostgreSQL container:

```bash
# Using Just recipes (recommended)
just run-postgres-container

# Or manually with Podman
podman run --name our-limit-order-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=our-limit-order-db \
  -p 5432:5432 \
  -d postgres:16
```

Initialize the database:

```bash
cd db
bun run setup
```

### 2️⃣ Application Setup ⚙️

Install dependencies:

```bash
bun install
```

Start development servers (API + Frontend):

```bash
bun run dev
```

### 3️⃣ Order Resolver (Optional) 🤖

To enable automated order filling:

```bash
cd resolver
cp .env.example .env
# Edit .env with your private key and 1inch API key
bun install
bun run start
```

## 📜 Available Scripts

### 🎯 Main Scripts

🌟 `bun run dev` - Start both API and frontend concurrently
🌟 `bun run dev:api` - Start API server only (watch mode)
🌟 `bun run dev:ui` - Start frontend only
🌟 `bun run start` - Run production build
🌟 `bun test` - Run tests

### 🏗️ Build & Production

🔨 `bun run build` - Build TypeScript to dist/
🔨 `bun run build:prod` - Full production build (install, fix, check, clean, build)
🔨 `bun run clean` - Remove dist/ directory
🔨 `bun run rebuild` - Clean everything and rebuild from scratch

### ✨ Code Quality

🎨 `bun run typecheck` - TypeScript type checking
🎨 `bun run lint` - Lint code with Biome
🎨 `bun run format` - Format code with Biome
🎨 `bun run lint:fix` - Fix linting issues
🎨 `bun run check` - Run typecheck + lint
🎨 `bun run fix` - Run format + lint:fix

### 🏭 Infrastructure

🔧 `bun run redis` - Start Redis container via Podman

### 🏗️ Smart Contracts

```bash
cd contracts

# Build contracts
forge build

# Run all tests
forge test

# Run tests with verbose output
forge test -vv

# Run specific test
forge test --match-contract InteractionMockTest

# Deploy (after configuring network in foundry.toml)
forge script script/Deploy.s.sol --rpc-url <RPC_URL> --private-key <PRIVATE_KEY>
```

## 🗃️ Database Management

### 🐘 PostgreSQL Container Management

Using Just recipes:

```bash
# Start PostgreSQL container
just run-postgres-container

# Connect to local database
just psql-connect-local

# Connect to remote database (using env vars)
just psql-connect-remote

# Stop and remove container
just rm-postgres-container
```

### ⚡ Database Operations

```bash
cd db

# Initialize database and create tables
bun run setup

# Create database only
bun run init

# Create tables only
bun run create-tables

# Reset database (drop all tables)
bun run reset

# Open Drizzle Studio
bun run studio
```

## 🤖 Order Resolver

The resolver automatically monitors the database for pending orders and fills profitable ones.

### 🛠️ Setup

```bash
cd resolver
cp .env.example .env
# Configure your private key and API keys
bun install
```

### 💫 Usage

```bash
# Start resolver
bun run start

# Development mode with auto-reload
bun run dev
```

### ⚙️ Configuration

🔑 Key environment variables:

🎌 `RESOLVER_PRIVATE_KEY` - Private key for resolver wallet
🎌 `ONE_INCH_API_KEY` - 1inch API key for price data
🎌 `MIN_PROFIT_WEI` - Minimum profit threshold (default: 0.05 ETH)
🎌 `POLL_INTERVAL_MS` - How often to check orders (default: 30s)

## 🌊 Architecture Flow

1️⃣ **Order Creation**: User creates order via frontend → API saves to database
2️⃣ **Order Monitoring**: Resolver polls database for pending orders
3️⃣ **Profitability Check**: Resolver checks market prices via 1inch API
4️⃣ **Order Filling**: Profitable orders are filled via 1inch contract
5️⃣ **Status Updates**: Database updated with fill status

## 💬 Suggested on discord

You need to make sure you have the proper feeTaker extension when submitting the limit order
cc @Rashid | X:mcmoodoo @abzel23 @hwang Lingo @Darius.TM 🥷 @di 龙小小 @sajal

essentially just use the latest verison of the @1inch/fusion-sdk and the createOrder function should handle building the feeTaker extension. This does require an extra API call to get the fee, but you can also cache the request, if the API rejects the order it's likely the whitelist changed or fee tier changed and you'll have to re-fetch the data anyway
