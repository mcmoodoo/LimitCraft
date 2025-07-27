import { Contract, parseUnits } from 'ethers';
import { MakerTraits, Extension, LimitOrder, Address, getLimitOrderContract, LimitOrderContract, TakerTraits } from '@1inch/limit-order-sdk';
import { config } from './config.js';
import { walletManager } from './wallet.js';
import { orderMonitor } from './monitor.js';
import type { Order } from '../../db/src/schema.js';

// 1inch Limit Order Protocol ABI (simplified - just the fillOrder function)
const LIMIT_ORDER_ABI = [
  'function fillOrder(tuple(uint256 salt, address makerAsset, address takerAsset, address maker, address receiver, address allowedSender, uint256 makingAmount, uint256 takingAmount, uint256 offsets, bytes interactions) order, bytes signature, bytes interaction, uint256 makingAmount, uint256 takingAmount) external returns (uint256, uint256, bytes32)',
  'function checkPredicate(tuple(uint256 salt, address makerAsset, address takerAsset, address maker, address receiver, address allowedSender, uint256 makingAmount, uint256 takingAmount, uint256 offsets, bytes interactions) order) external view returns (bool)'
];

interface FillResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export class OrderFiller {
  private limitOrderContract: Contract;

  constructor() {
    // Use the SDK to get the correct contract address for the network
    const contractAddress = getLimitOrderContract(config.chain.networkId);
    console.log(`🔗 Using 1inch Limit Order Contract: ${contractAddress} on chain ${config.chain.networkId}`);
    
    this.limitOrderContract = new Contract(
      contractAddress,
      LIMIT_ORDER_ABI,
      walletManager.wallet
    );
  }

  async fillOrder(order: Order): Promise<FillResult> {
    try {
      console.log(`🔄 Attempting to fill order ${order.orderHash}`);

      // Check wallet has sufficient balance
      if (!(await walletManager.checkSufficientBalance())) {
        return {
          success: false,
          error: 'Insufficient wallet balance'
        };
      }

      // Reconstruct the order struct for 1inch contract
      const orderStruct = this.reconstructOrderStruct(order);
      console.log('📋 Reconstructed order struct:', {
        salt: orderStruct.salt.toString(),
        maker: orderStruct.maker,
        makerAsset: orderStruct.makerAsset,
        takerAsset: orderStruct.takerAsset,
        makingAmount: orderStruct.makingAmount.toString(),
        takingAmount: orderStruct.takingAmount.toString(),
      });

      // Check if order is still valid (optional but recommended)
      try {
        console.log('🔍 Checking predicate for order...');
        const isValid = await this.limitOrderContract.checkPredicate(orderStruct);
        console.log('✅ Predicate check result:', isValid);
        if (!isValid) {
          return {
            success: false,
            error: 'Order predicate check failed'
          };
        }
      } catch (predicateError) {
        console.warn('⚠️ Could not check predicate, proceeding anyway:', predicateError);
        
        // If we get BUFFER_OVERRUN, the contract might not exist or function might be wrong
        if (predicateError.code === 'BUFFER_OVERRUN') {
          console.error('🚨 BUFFER_OVERRUN suggests contract/function issue. Checking contract...');
          
          // Test basic contract existence
          try {
            const code = await walletManager.provider.getCode(this.limitOrderContract.target);
            console.log('📋 Contract code length:', code.length);
            if (code === '0x') {
              return {
                success: false,
                error: 'Contract does not exist at the specified address'
              };
            }
          } catch (codeError) {
            console.error('❌ Error checking contract code:', codeError);
          }
        }
      }

      // Use the SDK to generate the fill order calldata
      const limitOrder = this.reconstructLimitOrder(order);
      const orderStructForSDK = limitOrder.build();
      
      // Create TakerTraits (default for now)
      const takerTraits = TakerTraits.default();
      
      // Generate calldata using the SDK
      const calldata = LimitOrderContract.getFillOrderCalldata(
        orderStructForSDK,
        order.signature,
        takerTraits,
        BigInt(order.takingAmount) // Fill full amount
      );
      
      console.log('📋 Generated calldata length:', calldata.length);
      
      // Send the transaction directly using the generated calldata
      const tx = await walletManager.wallet.sendTransaction({
        to: this.limitOrderContract.target,
        data: calldata,
        maxFeePerGas: parseUnits(config.resolver.maxGasPrice, 'wei'),
      });

      console.log(`📤 Fill transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        console.log(`✅ Order filled successfully: ${tx.hash}`);
        
        // Update order status in database
        await orderMonitor.updateOrderStatus(order.id, 'filled');
        
        return {
          success: true,
          txHash: tx.hash
        };
      } else {
        console.error(`❌ Fill transaction failed: ${tx.hash}`);
        return {
          success: false,
          error: 'Transaction failed'
        };
      }

    } catch (error: any) {
      console.error(`❌ Error filling order ${order.orderHash}:`, error);
      
      // Handle specific error cases
      let errorMessage = 'Unknown error';
      if (error.reason) {
        errorMessage = error.reason;
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  private reconstructOrderStruct(order: Order) {
    try {
      // Recreate the LimitOrder using the SDK with all original data
      const limitOrder = this.reconstructLimitOrder(order);
      
      // Use the SDK's build method to get the proper struct
      const orderStruct = limitOrder.build();
      
      console.log('🔍 SDK order struct fields:', {
        salt: orderStruct.salt,
        makerAsset: orderStruct.makerAsset,
        takerAsset: orderStruct.takerAsset,
        maker: orderStruct.maker,
        receiver: orderStruct.receiver,
        allowedSender: orderStruct.allowedSender,
        makingAmount: orderStruct.makingAmount,
        takingAmount: orderStruct.takingAmount,
        makerTraits: orderStruct.makerTraits,
        interactions: orderStruct.interactions,
      });
      
      // Return the struct exactly as the SDK provides it
      return {
        salt: BigInt(orderStruct.salt),
        makerAsset: orderStruct.makerAsset,
        takerAsset: orderStruct.takerAsset,
        maker: orderStruct.maker,
        receiver: orderStruct.receiver,
        allowedSender: orderStruct.allowedSender,
        makingAmount: BigInt(orderStruct.makingAmount),
        takingAmount: BigInt(orderStruct.takingAmount),
        offsets: BigInt(orderStruct.makerTraits),
        interactions: orderStruct.interactions,
      };
    } catch (error) {
      console.error('Error reconstructing order struct with SDK:', error);
      throw new Error(`Failed to reconstruct order struct: ${error.message}`);
    }
  }

  private reconstructLimitOrder(order: Order): LimitOrder {
    try {
      // Recreate the MakerTraits and Extension from stored data
      const makerTraits = new MakerTraits(BigInt(order.makerTraits));
      const extension = Extension.decode(order.extension);
      
      // Use the salt saved in the database
      const salt = BigInt(order.salt);
      
      // Create the order info data object with the saved salt
      const orderInfo = {
        salt: salt,
        makerAsset: new Address(order.makerAsset),
        takerAsset: new Address(order.takerAsset),
        makingAmount: BigInt(order.makingAmount),
        takingAmount: BigInt(order.takingAmount),
        maker: new Address(order.makerAddress),
      };
      
      console.log('🔍 Reconstructing LimitOrder with saved salt:', {
        salt: salt.toString(),
        makerAsset: orderInfo.makerAsset.toString(),
        takerAsset: orderInfo.takerAsset.toString(),
        maker: orderInfo.maker.toString(),
        makingAmount: orderInfo.makingAmount.toString(),
        takingAmount: orderInfo.takingAmount.toString(),
      });
      
      // Reconstruct the LimitOrder using the SDK
      return new LimitOrder(orderInfo, makerTraits, extension);
    } catch (error) {
      console.error('Error reconstructing LimitOrder with SDK:', error);
      throw new Error(`Failed to reconstruct LimitOrder: ${error.message}`);
    }
  }
}

export const orderFiller = new OrderFiller();