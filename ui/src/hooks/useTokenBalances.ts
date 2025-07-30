import { useCallback, useEffect, useState } from 'react';

interface TokenBalance {
  token_address: string;
  symbol: string;
  name: string;
  logo?: string;
  thumbnail?: string;
  decimals: number;
  balance: string;
  balance_formatted: string;
  possible_spam: boolean;
  verified_contract: boolean;
  security_score?: number;
}

interface TokenBalancesResponse {
  success: boolean;
  data?: {
    address: string;
    chainId: number;
    moralisChain: string;
    tokens: TokenBalance[];
    count: number;
  };
  error?: string;
}

export function useTokenBalances(address: string | undefined, chainId: number | undefined) {
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!address || !chainId) {
      setBalances([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = new URL(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/tokens/${address}`);
      url.searchParams.append('chainId', chainId.toString());
      
      const response = await fetch(url.toString());
      const result: TokenBalancesResponse = await response.json();

      if (result.success && result.data) {
        setBalances(result.data.tokens);
      } else {
        setError(result.error || 'Failed to fetch token balances');
        setBalances([]);
      }
    } catch (err) {
      console.error('Error fetching token balances:', err);
      setError('Failed to fetch token balances');
      setBalances([]);
    } finally {
      setLoading(false);
    }
  }, [address, chainId]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return {
    balances,
    loading,
    error,
    refetch: fetchBalances,
  };
}