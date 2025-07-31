export interface TokenBalance {
  token_address: string;
  symbol: string;
  name: string;
  logo?: string;
  thumbnail?: string;
  decimals: number;
  balance: string;
  possible_spam: boolean;
  verified_contract: boolean;
  total_supply?: string;
  total_supply_formatted?: string;
  percentage_relative_to_total_supply?: number;
  security_score?: number;
  balance_formatted?: string;
}

export interface TokenFetchResult {
  success: boolean;
  data?: {
    address: string;
    chainId: number;
    moralisChain?: string;
    tokens: TokenBalance[];
    count: number;
  };
  error?: string;
}