// Mapping of EVM Chain IDs to Moralis chain identifiers
export const CHAIN_ID_TO_MORALIS: Record<number, string> = {
  // Ethereum Mainnet
  1: 'eth',

  // Polygon
  137: 'polygon',

  // Arbitrum One
  42161: 'arbitrum',

  // Optimism
  10: 'optimism',

  // Base
  8453: 'base',

  // BSC
  56: 'bsc',

  // Avalanche
  43114: 'avalanche',

  // Fantom
  250: 'fantom',

  // Cronos
  25: 'cronos',

  // Testnet chains
  5: 'goerli', // Goerli (deprecated)
  11155111: 'sepolia', // Sepolia
  80001: 'mumbai', // Polygon Mumbai
  421614: 'arbitrum-sepolia', // Arbitrum Sepolia
};

export function getMoralisChainId(chainId: number): string | null {
  return CHAIN_ID_TO_MORALIS[chainId] || null;
}

export function getSupportedChains(): number[] {
  return Object.keys(CHAIN_ID_TO_MORALIS).map(Number);
}
