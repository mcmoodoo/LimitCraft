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
      // Log decoded MakerTraits
      const makerTraits = new MakerTraits(BigInt(order.makerTraits));
      console.log(`📋 Order ${order.orderHash} MakerTraits:`, {
        allowedSender: makerTraits.isPrivate() 
          ? makerTraits.allowedSender() 
          : 'Any sender allowed',
        isPrivate: makerTraits.isPrivate(),
        expiration: makerTraits.expiration() ? new Date(Number(makerTraits.expiration()) * 1000).toISOString() : 'No expiration',
        nonceOrEpoch: makerTraits.nonceOrEpoch().toString(),
        series: makerTraits.series().toString(),
        hasExtension: makerTraits.hasExtension(),
        isPartialFillAllowed: makerTraits.isPartialFillAllowed(),
        isMultipleFillsAllowed: makerTraits.isMultipleFillsAllowed(),
        hasPreInteraction: makerTraits.hasPreInteraction(),
        hasPostInteraction: makerTraits.hasPostInteraction(),
        isEpochManagerEnabled: makerTraits.isEpochManagerEnabled(),
        isPermit2: makerTraits.isPermit2(),
        isNativeUnwrapEnabled: makerTraits.isNativeUnwrapEnabled(),
        isBitInvalidatorMode: makerTraits.isBitInvalidatorMode()
      });

      // Log decoded Extension if present
      if (order.extension && order.extension !== '0x') {
        try {
          const extension = Extension.decode(order.extension);
          console.log(`🔧 Order ${order.orderHash} Extension:`, {
            makerAssetSuffix: extension.makerAssetSuffix || 'None',
            takerAssetSuffix: extension.takerAssetSuffix || 'None',
            makingAmountData: extension.makingAmountData || 'None',
            takingAmountData: extension.takingAmountData || 'None',
            predicate: extension.predicate || 'None',
            makerPermit: extension.makerPermit || 'None',
            preInteraction: extension.preInteraction || 'None',
            postInteraction: extension.postInteraction || 'None',
            customData: extension.customData || 'None'
          });

          // If there's takingAmountData (likely TWAP calculator), decode it
          if (extension.takingAmountData) {
            console.log(`🕐 TWAP Calculator Data (takingAmountData): ${extension.takingAmountData}`);
          }
        } catch (error) {
          console.error('❌ Failed to decode extension:', error);
        }
      }

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

      // Log the order struct that will be sent to the contract
      console.log(`📋 Order struct for ${order.orderHash}:`, {
        salt: orderStruct.salt.toString(),
        maker: orderStruct.maker,
        receiver: orderStruct.receiver,
        makerAsset: orderStruct.makerAsset,
        takerAsset: orderStruct.takerAsset,
        makingAmount: orderStruct.makingAmount.toString(),
        takingAmount: orderStruct.takingAmount.toString(),
        makerTraits: orderStruct.offsets.toString()
      });


      // Check if order is still valid (optional but recommended)
      try {
        const isValid = await this.limitOrderContract.checkPredicate(orderStruct);
        if (!isValid) {
          return {
            success: false,
            error: 'Order predicate check failed',
          };
        }
      } catch (predicateError: unknown) {

        // If we get BUFFER_OVERRUN, the contract might not exist or function might be wrong
        if (
          predicateError instanceof Error &&
          'code' in predicateError &&
          predicateError.code === 'BUFFER_OVERRUN'
        ) {
          // Test basic contract existence
          try {
            const code = await walletManager.provider.getCode(this.limitOrderContract.target);
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
        let takerTraits = TakerTraits.default().setExtension(extension);
        let amount = BigInt(order.takingAmount);

        // If this is a TWAP order, fill the order in parts
        if (order.numberOfOrders) {
          
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
        }

        // Use getFillOrderArgsCalldata for orders with extensions
        calldata = LimitOrderContract.getFillOrderArgsCalldata(
          orderStructForSDK,
          order.signature,
          takerTraits,
          amount  
        );
      }


      // Log transaction details before sending
      const txParams = {
        to: this.limitOrderContract.target,
        data: calldata,
        gasLimit: 1_000_000, // Set explicit gas limit for complex DeFi operations
        maxFeePerGas: parseUnits(config.resolver.maxGasPrice, 'wei'),
        maxPriorityFeePerGas: parseUnits('0.01', 'gwei'), // 0.01 gwei
      };

      console.log(`📤 Preparing fill transaction for order ${order.orderHash}:`, {
        to: txParams.to,
        from: walletManager.wallet.address,
        gasLimit: txParams.gasLimit.toString(),
        maxFeePerGas: txParams.maxFeePerGas.toString(),
        maxPriorityFeePerGas: txParams.maxPriorityFeePerGas.toString(),
        calldataLength: calldata.length,
        calldata: calldata
      });

      // First, simulate the transaction to get any revert reason
      try {
        console.log('🔍 Simulating transaction to check for reverts...');
        const simulationResult = await walletManager.provider.call({
          to: txParams.to,
          from: walletManager.wallet.address,
          data: txParams.data,
          gasLimit: txParams.gasLimit
        });
        console.log('✅ Simulation successful, proceeding with transaction');
      } catch (simulationError: any) {
        console.error('❌ Transaction simulation failed:', simulationError);
        
        // Extract revert reason from simulation
        if (simulationError.data) {
          const reason = this.decodeRevertReason(simulationError.data);
          console.error('🚫 Revert reason:', reason);
          return {
            success: false,
            error: `Transaction will revert: ${reason}`
          };
        }
        
        return {
          success: false,
          error: `Transaction simulation failed: ${simulationError.message}`
        };
      }

      // Send the transaction directly using the generated calldata
      const tx = await walletManager.wallet.sendTransaction(txParams);

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

      // Handle specific error cases with detailed logging
      let errorMessage = 'Unknown error';
      let errorDetails: any = {};

      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Extract various error properties
        if ('reason' in error && typeof error.reason === 'string') {
          errorDetails.reason = error.reason;
          errorMessage = error.reason;
        }
        
        if ('code' in error) {
          errorDetails.code = error.code;
        }
        
        if ('data' in error) {
          errorDetails.data = error.data;
        }
        
        if ('transaction' in error) {
          errorDetails.transaction = error.transaction;
        }
        
        if ('receipt' in error) {
          errorDetails.receipt = error.receipt;
        }
        
        // Try to decode revert reason if available
        if ('data' in error && typeof error.data === 'string' && error.data.startsWith('0x')) {
          try {
            // Common error signatures
            const errorSignatures: Record<string, string> = {
              '0x08c379a0': 'Error(string)',
              '0x4e487b71': 'Panic(uint256)',
              '0xb12d13eb': 'OnlyOwner()',
              '0x6c167909': 'OrderExpired()',
              '0x8e4a23d6': 'InvalidSender()',
              '0x815e1d64': 'InvalidAmount()',
              '0x756688fe': 'InvalidPredicate()',
            };
            
            const sig = error.data.substring(0, 10);
            if (errorSignatures[sig]) {
              errorDetails.decodedError = errorSignatures[sig];
              
              // Try to decode string error message
              if (sig === '0x08c379a0' && error.data.length >= 138) {
                try {
                  const hex = error.data.substring(138);
                  const str = Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
                  errorDetails.revertReason = str.trim();
                  errorMessage = `Revert: ${str.trim()}`;
                } catch {}
              }
            }
          } catch (decodeError) {
            console.error('Failed to decode error data:', decodeError);
          }
        }
      }

      console.error('📋 Error details:', errorDetails);

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

      // If allowance is sufficient, return success
      if (allowance >= requiredAmount) {
        return { success: true };
      }

      // Need to approve - send approval transaction

      const approvalAmount = ethers.MaxUint256;

      const approveTx = await takerAssetContract.approve(
        this.limitOrderContract.target,
        approvalAmount,
        {
          gasLimit: 100_000, // Standard approval gas limit
          maxFeePerGas: parseUnits(config.resolver.maxGasPrice, 'wei'),
          maxPriorityFeePerGas: parseUnits('0.01', 'gwei'), // 0.01 gwei
        }
      );

      // Wait for transaction confirmation
      const receipt = await approveTx.wait();

      if (receipt && receipt.status === 1) {

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

  private decodeRevertReason(data: string): string {
    if (!data || data === '0x') return 'Unknown revert reason';
    
    // Common error signatures
    const errorSignatures: Record<string, string> = {
      '0x08c379a0': 'Error(string)',
      '0x4e487b71': 'Panic(uint256)',
      '0xb12d13eb': 'OnlyOwner()',
      '0x6c167909': 'OrderExpired()',
      '0x8e4a23d6': 'InvalidSender()',
      '0x815e1d64': 'InvalidAmount()',
      '0x756688fe': 'InvalidPredicate()',
      '0x1b41e4c1': 'InvalidSignature()',
      '0x0a0b0d79': 'InvalidOrder()',
      '0x82b42900': 'Unauthorized()',
      '0x53c11f99': 'SwapFailed()',
    };
    
    const sig = data.substring(0, 10);
    
    // Handle string error message
    if (sig === '0x08c379a0' && data.length >= 138) {
      try {
        // Skip function selector (4 bytes) and offset (32 bytes) and length (32 bytes)
        const messageHex = data.substring(138);
        // Remove any trailing zeros and convert to string
        const message = Buffer.from(messageHex, 'hex').toString('utf8').replace(/\0/g, '').trim();
        return message || 'Empty revert message';
      } catch {
        return `Unknown error with signature ${sig}`;
      }
    }
    
    // Return known error type or generic message
    return errorSignatures[sig] || `Unknown error with signature ${sig}`;
  }
}

export const orderFiller = new OrderFiller();
