export interface Token {
  token_address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balance_formatted: string;
  possible_spam: boolean;
  verified_contract: boolean;
  logo?: string;
}

// Get selected token decimals for step calculation
export const getSelectedTokenDecimals = (tokenAddress: string, tokens: Token[]): number => {
  const token = tokens.find((t) => t.token_address === tokenAddress);
  return token?.decimals || 18; // default to 18 if not found
};

// Generate step value based on token decimals
export const getStepForDecimals = (decimals: number): string => {
  return `0.${'0'.repeat(decimals - 1)}1`;
};

// Safe parsing function that handles NaN
export const safeParseFloat = (value: string | number, defaultValue: number = 0): number => {
  if (typeof value === 'number') return isNaN(value) ? defaultValue : value;
  if (typeof value !== 'string' || value.trim() === '') return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
};

// Format balance for display
export const formatBalance = (balance: string): string => {
  const num = safeParseFloat(balance, 0);
  if (num === 0) return '0';
  if (num < 0.000001) return '<0.000001';
  if (num < 1) return num.toFixed(6);
  if (num < 1000) return num.toFixed(4);
  if (num < 1000000) return `${(num / 1000).toFixed(2)}K`;
  return `${(num / 1000000).toFixed(2)}M`;
};

// Calculate USD value for a token amount
export const calculateUsdValue = (
  amount: string, 
  tokenAddress: string, 
  tokenPrices: Record<string, number>
): string => {
  if (!amount || !tokenAddress) return '0.00';

  const price = tokenPrices[tokenAddress.toLowerCase()];
  if (!price) return '0.00';

  const numAmount = safeParseFloat(amount, 0);
  if (numAmount === 0) return '0.00';

  const usdValue = numAmount * price;

  if (usdValue < 0.01) return '<0.01';
  if (usdValue < 1000) return usdValue.toFixed(2);
  if (usdValue < 1000000) return `${(usdValue / 1000).toFixed(2)}K`;
  return `${(usdValue / 1000000).toFixed(2)}M`;
};