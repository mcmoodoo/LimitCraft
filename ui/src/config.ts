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

  // Top 10 tokens (example configuration for supported chains)
  topTokens: [
    {
      token_address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      balance: '0',
      balance_formatted: '0',
      possible_spam: false,
      verified_contract: true,
      logo: 'https://tokens.1inch.io/0xaf88d065e77c8cc2239327c5edb3a432268e5831.png'
    },
    {
      token_address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
      balance: '0',
      balance_formatted: '0',
      possible_spam: false,
      verified_contract: true,
      logo: 'https://tokens.1inch.io/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png'
    },
    {
      token_address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
      symbol: 'USDT',
      name: 'USD₮0',
      decimals: 6,
      balance: '0',
      balance_formatted: '0',
      possible_spam: false,
      verified_contract: true,
      logo: 'https://tokens.1inch.io/0xdac17f958d2ee523a2206206994597c13d831ec7.png'
    },
    {
      token_address: '0x912ce59144191c1204e64559fe8253a0e49e6548',
      symbol: 'ARB',
      name: 'ARB Token',
      decimals: 18,
      balance: '0',
      balance_formatted: '0',
      possible_spam: false,
      verified_contract: true,
      logo: 'https://tokens.1inch.io/0x912ce59144191c1204e64559fe8253a0e49e6548.png'
    },
    {
      token_address: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      balance: '0',
      balance_formatted: '0',
      possible_spam: false,
      verified_contract: true,
      logo: 'https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png'
    },
    {
      token_address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
      balance: '0',
      balance_formatted: '0',
      possible_spam: false,
      verified_contract: true,
      logo: 'https://tokens.1inch.io/0x6b175474e89094c44da98b954eedeac495271d0f.png'
    },
    {
      token_address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
      symbol: 'WBTC',
      name: 'Wrapped BTC',
      decimals: 8,
      balance: '0',
      balance_formatted: '0',
      possible_spam: false,
      verified_contract: true,
      logo: 'https://tokens.1inch.io/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599.png'
    },
    {
      token_address: '0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a',
      symbol: 'GMX',
      name: 'GMX',
      decimals: 18,
      balance: '0',
      balance_formatted: '0',
      possible_spam: false,
      verified_contract: true,
      logo: 'https://tokens.1inch.io/0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a.png'
    },
    {
      token_address: '0xf97f4df75117a78c1a5a0dbb814af92458539fb4',
      symbol: 'LINK',
      name: 'ChainLink Token',
      decimals: 18,
      balance: '0',
      balance_formatted: '0',
      possible_spam: false,
      verified_contract: true,
      logo: 'https://tokens.1inch.io/0x514910771af9ca656af840dff83e8264ecf986ca.png'
    },
    {
      token_address: '0x17fc002b466eec40dae837fc4be5c67993ddbd6f',
      symbol: 'FRAX',
      name: 'Frax',
      decimals: 18,
      balance: '0',
      balance_formatted: '0',
      possible_spam: false,
      verified_contract: true,
      logo: 'https://tokens.1inch.io/0x17fc002b466eec40dae837fc4be5c67993ddbd6f.png'
    }
  ],

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
    networkId: 42161, // Example chain ID
    rpcUrl: 'https://rpc.example.com', // Configure based on selected chain
  },

  // Contract Addresses
  contracts: {
    // Uniswap Permit2 contract (same address on all chains)
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  },
} as const;
