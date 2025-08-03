export const config = {
  // Database
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'our-limit-order-db',
  },

  // Blockchain
  chain: {
    networkId: Number(process.env.CHAIN_ID) || 42161, // Default chain ID
    rpcUrl: process.env.RPC_URL || 'https://rpc.example.com',
    privateKey: process.env.RESOLVER_PRIVATE_KEY || '',
  },

  // 1inch
  oneInch: {
    apiKey: process.env.ONE_INCH_API_KEY || '',
    limitOrderContractAddress: '0x111111125421ca6dc452d289314280a0f8842a65',
  },

  // Resolver settings
  resolver: {
    pollIntervalMs: 30000, // 30 seconds
    minProfitWei: '100000000000000000', // 0.1 ETH
    maxGasPrice: '100000000', // 0.1 gwei
  },

  // Tokens (example addresses - configure based on chain)
  tokens: {
    USDC: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    WETH: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
  },
} as const;

// Validation
function validateConfig() {
  const required = ['RESOLVER_PRIVATE_KEY', 'ONE_INCH_API_KEY'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

validateConfig();
