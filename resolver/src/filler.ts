import {
  Address,
  AmountMode,
  Extension,
  getLimitOrderContract,
  LimitOrder,
  LimitOrderContract,
  MakerTraits,
  TakerTraits,
} from '@1inch/limit-order-sdk';
import { Contract, ethers, parseUnits } from 'ethers';
import type { Order } from '../../db/src/schema';
import { AGGREGATION_ROUTER_ABI } from './abi';
import { config } from './config';
import { orderMonitor } from './monitor';
import { walletManager } from './wallet';

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
    console.log(
      `🔗 Using 1inch Limit Order Contract: ${contractAddress} on chain ${config.chain.networkId}`
    );

    this.limitOrderContract = new Contract(
      contractAddress,
      AGGREGATION_ROUTER_ABI,
      walletManager.wallet
    );
  }

  private checkTwapTimingCondition(
    orderHash: string,
    timestamp: Date
  ): FillResult | null {
    const timePassed = Date.now() - timestamp.getTime();
    const minWaitTime = 30 * 60 * 1000; // 30 minutes in milliseconds
    
    if (timePassed < minWaitTime) {
      const remainingTime = Math.ceil((minWaitTime - timePassed) / 1000 / 60); // minutes
      console.log(`⏰ TWAP order ${orderHash} needs to wait ${remainingTime} more minutes.`);
      // TOOD: just skip intead of returning error
      return {
        success: false,
        error: `TWAP order must wait ${remainingTime} more minutes`,
      };
    }
    
    return null; // No timing violation
  }

  async fillOrder(order: Order): Promise<FillResult> {
    try {
      console.log(`🔄 Attempting to fill order ${order.orderHash}`);

      // Check wallet has sufficient ETH balance
      if (!(await walletManager.checkSufficientBalance())) {
        return {
          success: false,
          error: 'Insufficient wallet balance',
        };
      }

      // Check if resolver has enough takerAsset balance
      const takerAssetBalance = await this.checkTakerAssetBalance(order);
      if (!takerAssetBalance.sufficient) {
        return {
          success: false,
          error: `Insufficient ${order.takerAsset} balance. Required: ${order.takingAmount}, Available: ${takerAssetBalance.balance}`,
        };
      }

      // Ensure resolver has enough ERC20 approval for takerAsset
      const approvalResult = await this.ensureTakerAssetApproval(order);
      if (!approvalResult.success) {
        return {
          success: false,
          error: approvalResult.error || 'Failed to ensure takerAsset approval',
        };
      }

      const limitOrder = this.reconstructLimitOrder(order);
      const orderStruct = this.reconstructOrderStruct(limitOrder);

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
            error: 'Order predicate check failed',
          };
        }
      } catch (predicateError: unknown) {
        console.warn('⚠️ Could not check predicate, proceeding anyway:', predicateError);

        // If we get BUFFER_OVERRUN, the contract might not exist or function might be wrong
        if (
          predicateError instanceof Error &&
          'code' in predicateError &&
          predicateError.code === 'BUFFER_OVERRUN'
        ) {
          console.error('🚨 BUFFER_OVERRUN suggests contract/function issue. Checking contract...');

          // Test basic contract existence
          try {
            const code = await walletManager.provider.getCode(this.limitOrderContract.target);
            console.log('📋 Contract code length:', code.length);
            if (code === '0x') {
              return {
                success: false,
                error: 'Contract does not exist at the specified address',
              };
            }
          } catch (codeError) {
            console.error('❌ Error checking contract code:', codeError);
          }
        }
      }

      // Use the same limitOrder instance for SDK calldata generation
      const orderStructForSDK = limitOrder.build();

      let calldata: string;
      
      if (order.extension === '0x') {
        // Use getFillOrderCalldata for orders without extensions
        calldata = LimitOrderContract.getFillOrderCalldata(
          orderStructForSDK,
          order.signature,
          TakerTraits.default(),
          BigInt(order.takingAmount) // Fill full amount
        );
      } else {
        const extension = Extension.decode(order.extension);
        console.log('🔍 Extension:', extension);
        let takerTraits = TakerTraits.default().setExtension(extension);
        let amount = BigInt(order.takingAmount);

        // If this is a TWAP order, fill the order in parts
        if (order.numberOfOrders) {
          console.log('🔍 TWAP order detected');
          
          // Check if 30 minutes have passed since order creation
          const creationTimingResult = this.checkTwapTimingCondition(
            order.orderHash,
            order.createdAt
          );
          if (creationTimingResult) {
            return creationTimingResult;
          }
          
          // Check if 30 minutes have passed since last fill for TWAP orders
          if (order.lastFillTxAt) {
            const lastFillTimingResult = this.checkTwapTimingCondition(
              order.orderHash,
              order.lastFillTxAt
            );
            if (lastFillTimingResult) {
              return lastFillTimingResult;
            }
          }
          
          takerTraits = takerTraits.setAmountMode(AmountMode.maker);
          amount = BigInt(order.makingAmount) / BigInt(order.numberOfOrders)
          // amount = BigInt(10)
          
          console.log('🔍 Amount:', amount);
        }
        console.log('🔍 TakerTraits:', takerTraits);

        // Use getFillOrderArgsCalldata for orders with extensions
        calldata = LimitOrderContract.getFillOrderArgsCalldata(
          orderStructForSDK,
          order.signature,
          takerTraits,
          amount  
        );
      }

      console.log('📋 Generated calldata length:', calldata.length);

      // Debug: Decode and print order extension before submitting transaction
      if (order.extension && order.extension !== '0x') {
        try {
          const decodedExtension = Extension.decode(order.extension);
          console.log('🔍 Decoded order extension:', {
            makerAssetSuffix: decodedExtension.makerAssetSuffix || 'empty',
            takerAssetSuffix: decodedExtension.takerAssetSuffix || 'empty', 
            makingAmountData: decodedExtension.makingAmountData || 'empty',
            takingAmountData: decodedExtension.takingAmountData || 'empty',
            predicate: decodedExtension.predicate || 'empty',
            makerPermit: decodedExtension.makerPermit || 'empty',
            preInteraction: decodedExtension.preInteraction || 'empty',
            postInteraction: decodedExtension.postInteraction || 'empty',
            customData: decodedExtension.customData || 'empty'
          });
          
          // If there's a makerPermit, log its length and first few bytes
          if (decodedExtension.makerPermit && decodedExtension.makerPermit !== 'empty') {
            console.log('🔐 MakerPermit details:', {
              length: decodedExtension.makerPermit.length,
              firstBytes: decodedExtension.makerPermit.substring(0, 50) + '...'
            });
          }
        } catch (error) {
          console.error('❌ Failed to decode extension:', error);
        }
      } else {
        console.log('📋 Order has no extension (extension = 0x)');
      }

      // Send the transaction directly using the generated calldata
      const tx = await walletManager.wallet.sendTransaction({
        to: this.limitOrderContract.target,
        data: calldata,
        gasLimit: 1_000_000, // Set explicit gas limit for complex DeFi operations
        maxFeePerGas: parseUnits(config.resolver.maxGasPrice, 'wei'),
        maxPriorityFeePerGas: parseUnits('0.01', 'gwei'), // 0.01 gwei (Arbitrum-optimized)
      });

      console.log(`📤 Fill transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();

      if (receipt && receipt.status === 1) {
        console.log(`✅ Order filled successfully!`);
        console.log(`- Block number: ${receipt.blockNumber}`);
        console.log(`- Gas used: ${receipt.gasUsed.toString()}`);

        // Get the block to extract the timestamp
        const block = await walletManager.provider.getBlock(receipt.blockNumber);
        const txTimestamp = block ? new Date(block.timestamp * 1000) : new Date();

        // Mark order as filled in database with transaction timestamp
        // TODO: get remaining amount for TWAP order and set status correctly. 
        const status = order.numberOfOrders ? 'partialFilled' : 'filled';
        await orderMonitor.updateOrderStatus(order.id, status, txTimestamp);

        return {
          success: true,
          txHash: tx.hash,
        };
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error: unknown) {
      console.error(`❌ Error filling order ${order.orderHash}:`, error);

      // Handle specific error cases
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        if ('reason' in error && typeof error.reason === 'string') {
          errorMessage = error.reason;
        } else {
          errorMessage = error.message;
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private reconstructOrderStruct(limitOrder: LimitOrder) {
    try {
      // Use the SDK's build method to get the proper struct
      const orderStruct = limitOrder.build();

      console.log('🔍 SDK order struct fields:', {
        salt: orderStruct.salt,
        makerAsset: orderStruct.makerAsset,
        takerAsset: orderStruct.takerAsset,
        maker: orderStruct.maker,
        receiver: orderStruct.receiver,
        makingAmount: orderStruct.makingAmount,
        takingAmount: orderStruct.takingAmount,
        makerTraits: orderStruct.makerTraits,
      });

      // Provide proper defaults for undefined values based on contract ABI
      const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
      const EMPTY_BYTES = '0x00';

      // Return the struct with proper defaults for contract compatibility
      // Convert any Address objects to strings for ethers.js compatibility
      return {
        salt: BigInt(orderStruct.salt),
        makerAsset: String(orderStruct.makerAsset),
        takerAsset: String(orderStruct.takerAsset),
        maker: String(orderStruct.maker),
        receiver: orderStruct.receiver ? String(orderStruct.receiver) : ZERO_ADDRESS,
        makingAmount: BigInt(orderStruct.makingAmount),
        takingAmount: BigInt(orderStruct.takingAmount),
        offsets: BigInt(orderStruct.makerTraits),
        interactions: EMPTY_BYTES, // Default for missing field
      };
    } catch (error: unknown) {
      console.error('Error reconstructing order struct with SDK:', error);
      throw new Error(
        `Failed to reconstruct order struct: ${error instanceof Error ? error.message : String(error)}`
      );
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
    } catch (error: unknown) {
      console.error('Error reconstructing LimitOrder with SDK:', error);
      throw new Error(
        `Failed to reconstruct LimitOrder: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async checkTakerAssetBalance(
    order: Order
  ): Promise<{ sufficient: boolean; balance: string }> {
    try {
      const ERC20_ABI = ['function balanceOf(address owner) view returns (uint256)'];

      const takerAssetContract = new Contract(order.takerAsset, ERC20_ABI, walletManager.provider);

      const balance = await takerAssetContract.balanceOf(walletManager.wallet.address);
      const requiredAmount = BigInt(order.takingAmount);

      console.log(`💰 TakerAsset balance check:`, {
        token: order.takerAsset,
        resolver: walletManager.wallet.address,
        balance: balance.toString(),
        required: requiredAmount.toString(),
        sufficient: balance >= requiredAmount,
      });

      return {
        sufficient: balance >= requiredAmount,
        balance: balance.toString(),
      };
    } catch (error: unknown) {
      console.error('❌ Error checking takerAsset balance:', error);
      return {
        sufficient: false,
        balance: '0',
      };
    }
  }

  private async ensureTakerAssetApproval(
    order: Order
  ): Promise<{ success: boolean; error?: string; txHash?: string }> {
    try {
      const ERC20_ABI = [
        'function allowance(address owner, address spender) view returns (uint256)',
        'function approve(address spender, uint256 amount) returns (bool)',
      ];

      const takerAssetContract = new Contract(order.takerAsset, ERC20_ABI, walletManager.wallet);

      // Check current allowance
      const allowance = await takerAssetContract.allowance(
        walletManager.wallet.address,
        this.limitOrderContract.target
      );
      const requiredAmount = BigInt(order.takingAmount);

      console.log(`🔒 TakerAsset approval check:`, {
        token: order.takerAsset,
        owner: walletManager.wallet.address,
        spender: this.limitOrderContract.target,
        allowance: allowance.toString(),
        required: requiredAmount.toString(),
        sufficient: allowance >= requiredAmount,
      });

      // If allowance is sufficient, return success
      if (allowance >= requiredAmount) {
        console.log(`✅ Sufficient approval already exists`);
        return { success: true };
      }

      // Need to approve - send approval transaction
      console.log(`📤 Sending approval transaction for ${order.takerAsset}...`);

      const approvalAmount = ethers.MaxUint256;

      const approveTx = await takerAssetContract.approve(
        this.limitOrderContract.target,
        approvalAmount,
        {
          gasLimit: 100_000, // Standard approval gas limit
          maxFeePerGas: parseUnits(config.resolver.maxGasPrice, 'wei'),
          maxPriorityFeePerGas: parseUnits('0.01', 'gwei'), // 0.01 gwei (Arbitrum-optimized)
        }
      );

      console.log(`📤 Approval transaction sent: ${approveTx.hash}`);

      // Wait for transaction confirmation
      const receipt = await approveTx.wait();

      if (receipt && receipt.status === 1) {
        console.log(`✅ Approval transaction confirmed!`);
        console.log(`- Block number: ${receipt.blockNumber}`);
        console.log(`- Gas used: ${receipt.gasUsed.toString()}`);

        return {
          success: true,
          txHash: approveTx.hash,
        };
      } else {
        throw new Error('Approval transaction failed');
      }
    } catch (error: unknown) {
      console.error('❌ Error ensuring takerAsset approval:', error);

      let errorMessage = 'Unknown approval error';
      if (error instanceof Error) {
        if ('reason' in error && typeof error.reason === 'string') {
          errorMessage = error.reason;
        } else {
          errorMessage = error.message;
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

export const orderFiller = new OrderFiller();
