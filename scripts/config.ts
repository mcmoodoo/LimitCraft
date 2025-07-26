function validateConfig() {
  const requiredEnvVars = ['ONE_INCH_API_KEY', 'PRIV_KEY'];
  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missing.join(', ')}`);
    console.warn('Set them with: export ONE_INCH_API_KEY=your-key PRIV_KEY=your-private-key');
  }
}

validateConfig();

export const config = {
  apiKey: process.env.ONE_INCH_API_KEY || '',
  networkId: 42161,
  rpcUrl: process.env.INFURA_ARBITRUM_MAINNET_RPC || 'https://arb1.arbitrum.io/rpc',

  tokens: {
    USDC: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    WETH: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    ARB: '0x912ce59144191c1204e64559fe8253a0e49e6548',
    ONE_INCH: '0x6314c31a7a1652ce482cffe247e9cb7c3f4bb9af',
  },

  contracts: {
    LIMIT_ORDER_CONTRACT_ARBITRUM: '0x111111125421ca6dc452d289314280a0f8842a65',
  },

  privateKey:
    process.env.PRIV_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
} as const;
