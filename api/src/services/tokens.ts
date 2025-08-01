import { getMoralisChainId } from '../chains';
import { TokenBalance, TokenFetchResult, OneInchTokenDetails, OneInchBalancesResponse } from '../types';

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

export async function fetchTokensWith1inch(address: string, chainId: number): Promise<TokenFetchResult> {
  try {
    // Check for 1inch API key
    const oneInchApiKey = process.env.ONE_INCH_API_KEY;
    if (!oneInchApiKey) {
      return {
        success: false,
        error: '1inch API key not configured',
      };
    }

    // Fetch token balances from 1inch
    const balancesUrl = `https://api.1inch.dev/balance/v1.2/${chainId}/balances/${address}`;
    
    const balancesResponse = await fetch(balancesUrl, {
      headers: {
        'Authorization': `Bearer ${oneInchApiKey}`,
        'accept': 'application/json',
        'content-type': 'application/json',
      },
    });

    if (!balancesResponse.ok) {
      console.error('1inch Balances API error:', balancesResponse.status, await balancesResponse.text());
      throw new Error(`1inch Balances API error: ${balancesResponse.status}`);
    }

    const balances = (await balancesResponse.json()) as OneInchBalancesResponse;

    // Filter tokens with non-zero balances
    const tokensWithBalance = Object.entries(balances)
      .filter(([_, balance]) => balance !== '0')
      .map(([address, balance]) => {
        return { address: address.toLowerCase(), balance };
      });

    if (tokensWithBalance.length === 0) {
      return {
        success: true,
        data: {
          address,
          chainId,
          tokens: [],
          count: 0,
        },
      };
    }

    // Fetch token details in parallel for all tokens with balances
    const tokenDetailsPromises = tokensWithBalance.map(async ({ address: tokenAddress, balance }) => {
      try {
        const detailsUrl = `https://api.1inch.dev/token-details/v1.0/details/${chainId}/${tokenAddress}`;
        const detailsResponse = await fetch(detailsUrl, {
          headers: {
            'Authorization': `Bearer ${oneInchApiKey}`,
            'accept': 'application/json',
            'content-type': 'application/json',
          },
        });

        if (!detailsResponse.ok) {
          console.error(`Failed to fetch details for token ${tokenAddress}:`, detailsResponse.status);
          return null;
        }

        const details = (await detailsResponse.json()) as OneInchTokenDetails;
        
        // Convert 1inch data to our TokenBalance format
        const tokenBalance: TokenBalance = {
          token_address: tokenAddress,
          symbol: details.assets.symbol,
          name: details.assets.name,
          decimals: details.assets.decimals,
          balance: balance,
          balance_formatted: (Number(balance) / Math.pow(10, details.assets.decimals)).toFixed(6),
          possible_spam: false, // 1inch doesn't provide spam detection
          verified_contract: details.assets.status === 'active',
          total_supply: details.details.totalSupply?.toString(),
          total_supply_formatted: details.details.totalSupply?.toLocaleString(),
          // Calculate percentage if total supply is available
          percentage_relative_to_total_supply: details.details.totalSupply 
            ? (Number(balance) / Math.pow(10, details.assets.decimals)) / details.details.totalSupply * 100
            : undefined,
        };

        return tokenBalance;
      } catch (error) {
        console.error(`Error fetching details for token ${tokenAddress}:`, error);
        return null;
      }
    });

    const tokenDetails = await Promise.all(tokenDetailsPromises);
    
    // Filter out failed requests and sort by balance
    const validTokens = tokenDetails
      .filter((token): token is TokenBalance => token !== null)
      .sort((a, b) => {
        // Sort by balance in descending order
        const balanceA = Number(a.balance) / Math.pow(10, a.decimals);
        const balanceB = Number(b.balance) / Math.pow(10, b.decimals);
        return balanceB - balanceA;
      });

    return {
      success: true,
      data: {
        address,
        chainId,
        tokens: validTokens,
        count: validTokens.length,
      },
    };
  } catch (error) {
    console.error('Error fetching token balances with 1inch:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}