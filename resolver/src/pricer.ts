import axios from 'axios';
import type { Order } from '../../db/src/schema.js';
import { config } from './config.js';

interface TokenPrice {
  price: string; // Price in USD
  decimals: number;
}

interface ProfitabilityResult {
  isProfitable: boolean;
  estimatedProfitWei: bigint;
  makerAssetPrice: TokenPrice;
  takerAssetPrice: TokenPrice;
  reason?: string;
}

export class PriceChecker {
  private priceCache = new Map<string, { price: TokenPrice; timestamp: number }>();
  private readonly CACHE_TTL = 30000; // 30 seconds

  async getTokenPrice(tokenAddress: string): Promise<TokenPrice | null> {
    try {
      // Check cache first
      const cached = this.priceCache.get(tokenAddress.toLowerCase());
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.price;
      }

      // Use 1inch price API
      const response = await axios.get(
        `https://api.1inch.dev/price/v1.1/${config.chain.networkId}/${tokenAddress}`,
        {
          headers: {
            Authorization: `Bearer ${config.oneInch.apiKey}`,
          },
          timeout: 5000,
        }
      );

      const tokenPrice: TokenPrice = {
        price: response.data[tokenAddress.toLowerCase()],
        decimals: 18, // Default - could be fetched from contract
      };

      // Cache the result
      this.priceCache.set(tokenAddress.toLowerCase(), {
        price: tokenPrice,
        timestamp: Date.now(),
      });

      return tokenPrice;
    } catch (error) {
      console.warn(`⚠️ Failed to get price for ${tokenAddress}:`, error);
      return null;
    }
  }

  async calculateProfitability(order: Order): Promise<ProfitabilityResult> {
    try {
      // Get prices for both tokens
      const [makerAssetPrice, takerAssetPrice] = await Promise.all([
        this.getTokenPrice(order.makerAsset),
        this.getTokenPrice(order.takerAsset),
      ]);

      if (!makerAssetPrice || !takerAssetPrice) {
        return {
          isProfitable: false,
          estimatedProfitWei: 0n,
          makerAssetPrice: makerAssetPrice || { price: '0', decimals: 18 },
          takerAssetPrice: takerAssetPrice || { price: '0', decimals: 18 },
          reason: 'Unable to fetch token prices',
        };
      }

      // Calculate USD values
      const makingAmountUSD = this.calculateUSDValue(BigInt(order.makingAmount), makerAssetPrice);

      const takingAmountUSD = this.calculateUSDValue(BigInt(order.takingAmount), takerAssetPrice);

      // Simple profitability: taking amount > making amount (in USD)
      const profitUSD = takingAmountUSD - makingAmountUSD;

      // Convert profit back to Wei (assuming we want profit in ETH)
      // This is simplified - in reality you'd need to account for gas costs
      const profitWei = this.usdToWei(profitUSD);

      // Estimate gas costs (simplified)
      const estimatedGasCost = BigInt(200000) * BigInt(config.resolver.maxGasPrice); // ~200k gas
      const netProfitWei = profitWei - estimatedGasCost;

      const isProfitable = netProfitWei >= BigInt(config.resolver.minProfitWei);

      return {
        isProfitable,
        estimatedProfitWei: netProfitWei,
        makerAssetPrice,
        takerAssetPrice,
        reason: isProfitable
          ? undefined
          : `Net profit ${this.formatWei(netProfitWei)} below minimum ${this.formatWei(BigInt(config.resolver.minProfitWei))}`,
      };
    } catch (error) {
      console.error('❌ Error calculating profitability:', error);
      return {
        isProfitable: false,
        estimatedProfitWei: 0n,
        makerAssetPrice: { price: '0', decimals: 18 },
        takerAssetPrice: { price: '0', decimals: 18 },
        reason: 'Calculation error',
      };
    }
  }

  private calculateUSDValue(amount: bigint, tokenPrice: TokenPrice): number {
    const amountInTokens = Number(amount) / 10 ** tokenPrice.decimals;
    return amountInTokens * parseFloat(tokenPrice.price);
  }

  private usdToWei(usdAmount: number): bigint {
    // Simplified: assume 1 ETH = $2000 (in real implementation, get ETH price)
    const ethPrice = 2000;
    const ethAmount = usdAmount / ethPrice;
    return BigInt(Math.floor(ethAmount * 1e18));
  }

  private formatWei(wei: bigint): string {
    return `${(Number(wei) / 1e18).toFixed(4)} ETH`;
  }
}

export const priceChecker = new PriceChecker();
