# Order Resolver

Automated order resolver and filler for the Orderly application. This service continuously monitors the database for pending orders, checks their profitability, and automatically fills profitable orders using the 1inch Limit Order Protocol.

## Project Structure

```
resolver/
├── src/
│   ├── index.ts      # Main entry point and polling scheduler
│   ├── monitor.ts    # Database order monitoring
│   ├── pricer.ts     # Price checking & profitability calculation
│   ├── filler.ts     # 1inch contract interaction and order filling
│   ├── wallet.ts     # Wallet management and balance checks
│   ├── config.ts     # Configuration management
│   └── abi.ts        # Contract ABIs
├── scripts/
│   └── fill.ts       # Manual order filling script
├── package.json
├── .env              # Environment variables (create from .env.example)
└── .env.example      # Environment template
```

## Key Features

- **Automated Polling** - Checks orders every 30 seconds by default
- **Database Integration** - Monitors pending, non-expired orders  
- **Price Discovery** - Uses 1inch API for real-time token prices
- **Profitability Analysis** - Calculates net profit after gas costs
- **Order Execution** - Fills orders via 1inch Limit Order Protocol
- **Wallet Management** - Balance validation and transaction handling
- **Error Recovery** - Graceful error handling and logging

## Setup and Usage

### Environment Configuration

```bash
cd resolver
cp .env.example .env
```

Configure your `.env` file:

```bash
# Database Connection
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/our-limit-order-db

# Blockchain Configuration (Arbitrum)
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
RESOLVER_PRIVATE_KEY=your_private_key_here

# 1inch API
ONE_INCH_API_KEY=your_1inch_api_key_here

# Resolver Settings
POLL_INTERVAL_MS=30000              # Polling frequency
MIN_PROFIT_WEI=50000000000000000    # 0.05 ETH minimum profit
MAX_GAS_PRICE=50000000000           # 50 gwei gas limit
```

### Installation and Startup

```bash
# Install dependencies
bun install

# Start the resolver
bun run start

# Development mode with auto-reload
bun run dev
```

## How It Works

The resolver operates in a continuous polling cycle:

1. **Database Monitoring** - Queries for orders with status='pending' and not expired
2. **Order Validation** - Marks expired orders and validates remaining orders
3. **Price Discovery** - Fetches current market prices via 1inch API
4. **Profitability Analysis**:
   - Converts token amounts to USD values
   - Calculates gross profit in ETH
   - Estimates gas costs
   - Only proceeds if net profit exceeds threshold
5. **Order Execution** - Calls 1inch Limit Order Protocol contract
6. **Status Updates** - Updates database with execution results

## Profitability Calculation

```typescript
// Basic profitability logic:
const grossProfitUSD = takingAmountUSD - makingAmountUSD
const grossProfitETH = grossProfitUSD / ethPriceUSD
const netProfitETH = grossProfitETH - estimatedGasCostETH

// Fills order only if:
netProfitETH >= MIN_PROFIT_WEI
```

## Wallet Requirements

The resolver wallet must have:

- **ETH for gas** - Minimum 0.1 ETH recommended
- **Token balances** - Sufficient tokens to fulfill orders
- **Private key security** - Keep private keys secure and never commit to repo

## Safety Features

- **Balance Validation** - Checks ETH balance before attempting fills
- **Gas Estimation** - Pre-execution gas cost estimation
- **Order Validation** - Validates order parameters and predicates
- **Error Recovery** - Graceful error handling with detailed logging
- **Graceful Shutdown** - Proper cleanup on process termination

## Monitoring and Logging

The resolver provides comprehensive console logging for monitoring:

```
🚀 Starting Order Resolver...
📊 Poll interval: 30000ms
💰 Min profit threshold: 0.05 ETH
👛 Wallet balance: 0.1234 ETH
🔍 Checking for orders to fill...
📊 Found 3 pending orders
🔍 Analyzing order 0xabc123...
💰 Order 0xabc123 is profitable! Net profit: 0.075 ETH
🔄 Filling order 0xabc123
✅ Order filled successfully: 0xdef456
```

## Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `POLL_INTERVAL_MS` | 30000 | Polling frequency in milliseconds |
| `MIN_PROFIT_WEI` | 50000000000000000 | Minimum profit threshold (0.05 ETH) |
| `MAX_GAS_PRICE` | 50000000000 | Maximum gas price limit (50 gwei) |
| `RESOLVER_PRIVATE_KEY` | - | Resolver wallet private key |
| `ONE_INCH_API_KEY` | - | 1inch API key for price data |

## Development

```bash
# Development mode with hot reload
bun run dev

# Manual order filling script
bun run scripts/fill.ts
```

## Important Considerations

- **Security**: Never commit private keys to version control
- **Capital**: Ensure sufficient token balances for order fulfillment  
- **Gas Costs**: Monitor and adjust gas price limits based on network conditions
- **API Limits**: 1inch API has rate limits - adjust polling frequency accordingly
- **Network**: Currently configured for Arbitrum mainnet
