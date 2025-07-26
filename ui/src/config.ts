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

  // Token Options for UI
  tokenOptions: [
    { value: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', label: 'USDC' },
    { value: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', label: 'WETH' },
    { value: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', label: 'USDT' },
    { value: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', label: 'USDC.e' },
  ],

  // Order Configuration
  order: {
    // Default values for new orders
    defaults: {
      makerAsset: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
      takerAsset: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
      expiresIn: 3600, // 1 hour
    },

    // Expiration options in seconds
    expirationOptions: [
      { value: 300, label: '5 minutes' },
      { value: 600, label: '10 minutes' },
      { value: 1800, label: '30 minutes' },
      { value: 3600, label: '1 hour' },
      { value: 7200, label: '2 hours' },
      { value: 86400, label: '24 hours' },
    ],
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

// Helper functions
export const formatAddress = (address: string): string => {
  const { start, end } = config.formatting.addressTruncation;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
};

export const formatAmount = (amount: string): string => {
  const num = BigInt(amount);
  const divisor = 10 ** config.formatting.tokenDecimals;
  return (Number(num) / divisor).toFixed(config.formatting.displayDecimals);
};

export const toWei = (amount: number): string => {
  const multiplier = 10 ** config.formatting.tokenDecimals;
  return (amount * multiplier).toString();
};
