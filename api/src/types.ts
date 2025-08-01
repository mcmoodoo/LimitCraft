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

// 1inch API response types
export interface OneInchTokenDetails {
  symbol: string;
  name: string;
  address: string;
  chainId: number;
  decimals: number;
  logoURI: string;
  isFoT: boolean;
  displayedSymbol: string;
  rating: number;
  eip2612: boolean;
  tags: Array<{
    value: string;
    provider: string;
  }>;
  providers: string[];
}

export type OneInchBalancesResponse = Record<string, string>;

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