import {
  getLimitOrderContract,
  LimitOrder,
  LimitOrderContract,
  MakerTraits,
  TakerTraits,
  Address,
  Extension,
} from '@1inch/limit-order-sdk';
import { Contract, ethers, parseUnits } from 'ethers';
import { JsonRpcProvider, Wallet } from 'ethers';
import type { Order } from '../../db/src/schema.js';
import { updateOrderStatus } from '../../db/src/index.js';
import { config } from './config.js';

interface FillResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

// Simple ABI for the limit order contract
const LIMIT_ORDER_ABI = [
  'function fillOrder(tuple(uint256 salt, address makerAsset, address takerAsset, address maker, address receiver, uint256 makingAmount, uint256 takingAmount, uint256 offsets, bytes interactions) order, bytes signature, uint256 makingAmount, uint256 takingAmount, uint256 skipPermitAndThresholdAmount) external returns (uint256, uint256, bytes32)',
];

export class APIOrderFiller {
  private limitOrderContract: Contract;
  private provider: JsonRpcProvider;
  private wallet: Wallet;

  constructor() {
    this.provider = new JsonRpcProvider(config.rpcUrl);
    // Hardcoded private key for resolver operations
    const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    this.wallet = new Wallet(privateKey, this.provider);
    
    console.log(`🔑 Using wallet address: ${this.wallet.address}`);
    console.log(`🌐 RPC URL: ${config.rpcUrl}`);
    console.log(`⛓️ Network ID: ${config.networkId}`);
    
    // Use the actual 1inch contract address since we forked Arbitrum
    const contractAddress = getLimitOrderContract(config.networkId);
      
    console.log(`🔗 Using contract address: ${contractAddress}`);
    
    this.limitOrderContract = new Contract(
      contractAddress,
      LIMIT_ORDER_ABI,
      this.wallet
    );
  }

  async fillOrder(order: Order): Promise<FillResult> {
    try {
      console.log(`🔄 Attempting to fill order ${order.orderHash}`);

      // Check wallet has sufficient balance
      const balance = await this.provider.getBalance(this.wallet.address);
      console.log(`👛 Wallet balance: ${(Number(balance) / 1e18).toFixed(4)} ETH`);
      
      if (balance < parseUnits('0.001', 'ether')) { // Reduced threshold to 0.001 ETH
        return {
          success: false,
          error: `Insufficient wallet balance: ${(Number(balance) / 1e18).toFixed(4)} ETH`,
        };
      }

      // Reconstruct the limit order
      const limitOrder = this.reconstructLimitOrder(order);
      const orderStruct = this.reconstructOrderStruct(limitOrder);
      
      // Generate calldata using the SDK
      const takerTraits = TakerTraits.default();
      
      // Since we forked Arbitrum, the 1inch contract exists - proceed with real transaction
      
      const calldata = LimitOrderContract.getFillOrderCalldata(
        limitOrder.build(),
        order.signature,
        takerTraits,
        BigInt(order.takingAmount) // Fill full amount
      );
      
      console.log(`📋 Generated calldata: ${calldata}`);
      console.log(`📋 Calldata length: ${calldata.length}`);

      // Send the transaction
      const tx = await this.wallet.sendTransaction({
        to: this.limitOrderContract.target,
        data: calldata,
        gasLimit: 1_000_000,
        maxFeePerGas: parseUnits('50', 'gwei'),
        maxPriorityFeePerGas: parseUnits('2', 'gwei'),
      });

      console.log(`📤 Fill transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt && receipt.status === 1) {
        console.log(`✅ Order filled successfully!`);
        
        try {
          // Mark order as filled in database
          await updateOrderStatus(order.id, 'filled');
        } catch (dbError) {
          console.error('⚠️ Transaction succeeded but failed to update database:', dbError);
          // Still return success since blockchain transaction worked
        }

        return {
          success: true,
          txHash: tx.hash,
        };
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error: any) {
      console.error(`❌ Error filling order ${order.orderHash}:`, error);

      let errorMessage = 'Unknown error';
      if (error.reason) {
        errorMessage = error.reason;
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private reconstructLimitOrder(order: Order): LimitOrder {
    const makerTraits = new MakerTraits(BigInt(order.makerTraits));
    const extension = Extension.decode(order.extension);
    const salt = BigInt(order.salt);

    const orderInfo = {
      salt: salt,
      makerAsset: new Address(order.makerAsset),
      takerAsset: new Address(order.takerAsset),
      makingAmount: BigInt(order.makingAmount),
      takingAmount: BigInt(order.takingAmount),
      maker: new Address(order.makerAddress),
    };

    return new LimitOrder(orderInfo, makerTraits, extension);
  }

  private reconstructOrderStruct(limitOrder: LimitOrder) {
    const orderStruct = limitOrder.build();
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    const EMPTY_BYTES = '0x';

    return {
      salt: BigInt(orderStruct.salt),
      makerAsset: String(orderStruct.makerAsset),
      takerAsset: String(orderStruct.takerAsset),
      maker: String(orderStruct.maker),
      receiver: orderStruct.receiver ? String(orderStruct.receiver) : ZERO_ADDRESS,
      makingAmount: BigInt(orderStruct.makingAmount),
      takingAmount: BigInt(orderStruct.takingAmount),
      offsets: BigInt(orderStruct.makerTraits),
      interactions: EMPTY_BYTES,
    };
  }
}