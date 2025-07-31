import { getMoralisChainId } from '../chains';
import { TokenBalance, TokenFetchResult } from '../types';

export async function fetchTokensWithMoralis(address: string, chainId: number): Promise<TokenFetchResult> {
  try {
    // Get Moralis chain identifier
    const moralisChain = getMoralisChainId(chainId);
    if (!moralisChain) {
      return {
        success: false,
        error: `Unsupported chain ID: ${chainId}`,
      };
    }

    // Check for Moralis API key
    const moralisApiKey = process.env.MORALIS_API_KEY;
    if (!moralisApiKey) {
      return {
        success: false,
        error: 'Moralis API key not configured',
      };
    }

    // Fetch token balances from Moralis
    const moralisUrl = `https://deep-index.moralis.io/api/v2.2/${address}/erc20?chain=${moralisChain}`;

    const response = await fetch(moralisUrl, {
      headers: {
        'X-API-Key': moralisApiKey,
      },
    });

    if (!response.ok) {
      console.error('Moralis API error:', response.status, await response.text());
      throw new Error(`Moralis API error: ${response.status}`);
    }

    const tokens = (await response.json()) as TokenBalance[];

    // Filter out spam tokens and add formatted balance
    const filteredTokens = tokens
      .filter((token) => !token.possible_spam && token.verified_contract)
      .map((token) => ({
        ...token,
        balance_formatted: (Number(token.balance) / Math.pow(10, token.decimals)).toFixed(6),
      }))
      .sort((a, b) => b.security_score || 0 - (a.security_score || 0)); // Sort by security score

    return {
      success: true,
      data: {
        address,
        chainId,
        moralisChain,
        tokens: filteredTokens,
        count: filteredTokens.length,
      },
    };
  } catch (error) {
    console.error('Error fetching token balances with Moralis:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}