export const config = {
  // API Configuration
  api: {
    baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  },

  // Token Configuration
  tokens: {
    USDC: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    WETH: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    USDC_E: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    ARB: '0x912ce59144191c1204e64559fe8253a0e49e6548',
  },

  // Order Configuration
  order: {
    // Default values for new orders
    defaults: {
      makerAsset: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
      takerAsset: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
      expiresIn: 3600, // 1 hour
    },
  },

  // Formatting Configuration
  formatting: {
    // Token decimal places
    tokenDecimals: 18,
    // Number of decimal places to show in UI
    displayDecimals: 6,
    // Address truncation (show first N and last N characters)
    addressTruncation: { start: 6, end: 4 },
  },

  // Blockchain Configuration
  blockchain: {
    networkId: 42161, // Arbitrum
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
  },
} as const;
