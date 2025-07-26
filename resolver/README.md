# Order Resolver

Automated order resolver and filler for the orderbook application. This service continuously monitors the database for pending orders, checks their profitability, and automatically fills profitable orders using the 1inch Limit Order Protocol.

## 📁 Project Structure

```
resolver/
├── src/
│   ├── index.ts      # Main polling scheduler
│   ├── monitor.ts    # Database order monitoring
│   ├── pricer.ts     # Price checking & profitability
│   ├── filler.ts     # 1inch contract interaction
│   ├── wallet.ts     # Wallet management
│   └── config.ts     # Configuration
├── package.json
├── .env              # Your environment variables
└── .env.example      # Template
```

## 🔧 Key Features

- **✅ Polling scheduler** - Checks orders every 30 seconds
- **✅ Database monitoring** - Finds pending, non-expired orders
- **✅ Price checking** - Uses 1inch API for token prices
- **✅ Profitability calculation** - Accounts for gas costs
- **✅ Order filling** - Calls 1inch `fillOrder()` contract
- **✅ Wallet management** - Balance checks and transaction handling
- **✅ Error handling** - Graceful shutdown and error recovery

## 🚀 Setup and Usage

### 1. Set up environment

```bash
cd resolver
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=our-limit-order-db

# Blockchain (Arbitrum)
ARBITRUM_RPC=https://arb1.arbitrum.io/rpc
RESOLVER_PRIVATE_KEY=0x1234...your-private-key-here

# 1inch API
ONE_INCH_API_KEY=your-1inch-api-key-here

# Resolver Settings
POLL_INTERVAL_MS=30000              # 30 seconds
MIN_PROFIT_WEI=50000000000000000    # 0.05 ETH minimum profit
MAX_GAS_PRICE=50000000000           # 50 gwei max gas price
```

### 2. Install dependencies

```bash
bun install
```

### 3. Run the resolver

```bash
# Start the resolver
bun run start

# Or for development with auto-reload
bun run dev
```

## 💡 How It Works

The resolver operates in a continuous polling loop:

1. **Monitors database** for pending orders (status='pending', not expired)
2. **Marks expired orders** as expired in the database
3. **Checks market prices** via 1inch API for maker/taker assets
4. **Calculates profitability**:
   - Converts token amounts to USD
   - Calculates profit in ETH
   - Subtracts estimated gas costs
   - Only proceeds if profit > minimum threshold
5. **Fills profitable orders** by calling 1inch `fillOrder()` contract
6. **Updates database** status to 'filled' on successful execution

## 📊 Profitability Logic

```typescript
// Simplified profitability calculation:
takingAmountUSD - makingAmountUSD = grossProfitUSD
grossProfitETH - gasCostETH = netProfitETH

// Only fill if:
netProfitETH >= MIN_PROFIT_WEI
```

## 💰 Wallet Requirements

Your resolver wallet needs:

- **ETH balance** for gas fees (recommended: >0.1 ETH)
- **Token balances** to fulfill orders, OR
- **Flash loan integration** (not implemented - would need Aave/dYdX)

## 🛡️ Safety Features

- **Balance checks** - Won't attempt fills if insufficient ETH
- **Gas estimation** - Estimates gas before execution
- **Predicate validation** - Checks order validity before filling
- **Error handling** - Graceful error recovery and logging
- **Graceful shutdown** - Handles SIGINT/SIGTERM properly

## 📈 Monitoring

The resolver provides detailed console logging:

```
🚀 Starting Order Resolver...
📊 Poll interval: 30000ms
💰 Min profit: 50000000000000000 wei
👛 Wallet balance: 0.1234 ETH
🔍 Checking for orders to fill...
📊 Found 3 pending orders
🔍 Analyzing order 0xabc123...
💰 Order 0xabc123 is profitable! Estimated profit: 0.0750 ETH
🔄 Attempting to fill order 0xabc123
📤 Fill transaction sent: 0xdef456...
✅ Order filled successfully: 0xdef456
```

## 🔧 Configuration Options

| Variable               | Default           | Description                                |
| ---------------------- | ----------------- | ------------------------------------------ |
| `POLL_INTERVAL_MS`     | 30000             | How often to check for orders (ms)         |
| `MIN_PROFIT_WEI`       | 50000000000000000 | Minimum profit threshold (0.05 ETH)        |
| `MAX_GAS_PRICE`        | 50000000000       | Maximum gas price willing to pay (50 gwei) |
| `RESOLVER_PRIVATE_KEY` | -                 | Private key for resolver wallet            |
| `ONE_INCH_API_KEY`     | -                 | 1inch API key for price data               |

## 🚨 Important Notes

- **Private Key Security**: Keep your resolver private key secure and never commit it to version control
- **Capital Requirements**: Ensure your wallet has sufficient tokens to fill orders
- **Gas Management**: Monitor gas prices and adjust `MAX_GAS_PRICE` accordingly
- **API Limits**: 1inch API has rate limits - adjust polling frequency if needed
- **Network**: Currently configured for Arbitrum mainnet

## 🛠️ Development

For development and testing:

```bash
# Watch mode with auto-reload
bun run dev

# Build TypeScript
bun run build
```

## 📝 Order Flow

1. User creates order via frontend
2. Order saved to database with status='pending'
3. Resolver detects order in next polling cycle
4. Resolver checks profitability via price APIs
5. If profitable, resolver calls 1inch contract to fill order
6. Database updated to status='filled' on success
7. User sees filled order in frontend
