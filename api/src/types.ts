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
  details: {
    circulatingSupply?: number;
    totalSupply?: number;
    vol24?: number;
    marketCap?: number;
    provider?: string;
    providerURL?: string;
  };
  assets: {
    name: string;
    type: string;
    symbol: string;
    decimals: number;
    website?: string;
    description?: string;
    explorer?: string;
    status?: string;
    id: string;
    links?: Array<{
      name: string;
      url: string;
    }>;
    tags?: string[];
  };
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