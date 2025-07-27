import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import { config } from './config.js';

export class WalletManager {
  public provider: JsonRpcProvider;
  public wallet: Wallet;

  constructor() {
    this.provider = new JsonRpcProvider(config.chain.rpcUrl);
    this.wallet = new Wallet(config.chain.privateKey, this.provider);

    console.log(`🔑 Resolver wallet: ${this.wallet.address}`);
  }

  async getBalance(): Promise<bigint> {
    try {
      return await this.provider.getBalance(this.wallet.address);
    } catch (error) {
      console.error('❌ Error getting wallet balance:', error);
      return 0n;
    }
  }

  async getTokenBalance(tokenAddress: string): Promise<bigint> {
    try {
      // Simple ERC20 balance call
      const abi = ['function balanceOf(address) view returns (uint256)'];
      const contract = new Contract(tokenAddress, abi, this.provider);
      return await contract.balanceOf(this.wallet.address);
    } catch (error) {
      console.error(`❌ Error getting token balance for ${tokenAddress}:`, error);
      return 0n;
    }
  }

  async checkSufficientBalance(): Promise<boolean> {
    try {
      const balance = await this.getBalance();
      const minBalance = BigInt('5000000000000000'); // 0.005 ETH for gas

      if (balance < minBalance) {
        console.warn(`⚠️ Low ETH balance: ${this.formatEther(balance)} ETH`);
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ Error checking balance:', error);
      return false;
    }
  }

  private formatEther(wei: bigint): string {
    return (Number(wei) / 1e18).toFixed(4);
  }
}

export const walletManager = new WalletManager();
