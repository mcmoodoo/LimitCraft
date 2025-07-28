import {
  getLimitOrderContract,
  LimitOrder,
  MakerTraits,
  TakerTraits,
  Address,
  Extension,
} from '@1inch/limit-order-sdk';
import { Contract, parseUnits } from 'ethers';
import { JsonRpcProvider, Wallet } from 'ethers';
import { getOrderByHash, updateOrderStatus } from '../db/src/index.js';

// Config extracted from api/src/config.ts
const config = {
  rpcUrl: 'http://localhost:8545',
  networkId: 42161, // Keep Arbitrum network ID since we forked it
};

interface FillResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

interface Order {
  id: number;
  orderHash: string;
  salt: string;
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  makerAddress: string;
  expiresIn: Date;
  signature: string;
  makerTraits: string;
  extension: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// Simple ABI for the limit order contract
const LIMIT_ORDER_ABI = [
  'function fillOrderArgs(tuple(uint256 salt, address makerAsset, address takerAsset, address maker, address receiver, uint256 makingAmount, uint256 takingAmount, uint256 offsets, bytes interactions) order, bytes32 r, bytes32 vs, uint256 amount, uint256 takerTraits, bytes calldata args) external payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash)',
];

class OrderFiller {
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

  async fillOrderArgs(order: Order): Promise<FillResult> {
    try {
      console.log(`🔄 Attempting to fill order ${order.orderHash} using fillOrderArgs`);

      // Check wallet has sufficient balance
      const balance = await this.provider.getBalance(this.wallet.address);
      console.log(`👛 Wallet balance: ${(Number(balance) / 1e18).toFixed(4)} ETH`);
      
      if (balance < parseUnits('0.001', 'ether')) {
        return {
          success: false,
          error: `Insufficient wallet balance: ${(Number(balance) / 1e18).toFixed(4)} ETH`,
        };
      }

      // Reconstruct the limit order
      const limitOrder = this.reconstructLimitOrder(order);
      const orderStruct = this.reconstructOrderStruct(limitOrder);

      console.log("--- Reconstructed Limit Order BEGIN ---");
      console.log(limitOrder);
      console.log("--- Reconstructed Limit Order END -----");

      // Split signature into r and vs components
      const signature = order.signature.startsWith('0x') ? order.signature.slice(2) : order.signature;
      const r = '0x' + signature.slice(0, 64);
      const vs = '0x' + signature.slice(64, 128);
      
      console.log(`🔑 Signature components - r: ${r}, vs: ${vs}`);

      // Use default taker traits and full taking amount
      const takerTraits = TakerTraits.default();
      const amount = BigInt(order.takingAmount);
      const args = '0x'; // Empty args

      console.log(`📋 Using amount: ${amount}, takerTraits: ${takerTraits.encode().trait}`);

      // Call fillOrderArgs directly on contract
      const tx = await this.limitOrderContract.fillOrderArgs(
        orderStruct,
        r,
        vs,
        amount,
        takerTraits.encode().trait,
        args,
        {
          gasLimit: 1_000_000,
          maxFeePerGas: parseUnits('50', 'gwei'),
          maxPriorityFeePerGas: parseUnits('2', 'gwei'),
        }
      );

      console.log(`📤 FillOrderArgs transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt && receipt.status === 1) {
        console.log(`✅ Order filled successfully using fillOrderArgs!`);
        
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
      console.error(`❌ Error filling order ${order.orderHash} with fillOrderArgs:`, error);

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
      receiver: new Address('0x0000000000000000000000000000000000000000'), // Zero address as receiver
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

// Order validation
function validateOrderForFilling(order: Order): { canFill: boolean; reason?: string } {
  if (order.status !== 'pending') {
    return {
      canFill: false,
      reason: `Order is not pending. Current status: ${order.status}`,
    };
  }

  // Check if order has expired
  if (order.expiresIn && new Date() > order.expiresIn) {
    return {
      canFill: false,
      reason: 'Order has expired',
    };
  }

  return { canFill: true };
}

async function fillOrderWithArgs(orderHash: string): Promise<void> {
  console.log(`🎯 Filling order using fillOrderArgs: ${orderHash}`);

  try {
    // Step 1: Get order from database
    const order = await getOrderByHash(orderHash);
    
    if (!order) {
      console.error('❌ Order not found');
      return;
    }

    // Step 2: Validate order can be filled
    const validationResult = validateOrderForFilling(order);
    if (!validationResult.canFill) {
      console.error(`❌ Cannot fill order: ${validationResult.reason}`);
      return;
    }

    // Step 3: Execute the fill using fillOrderArgs
    const orderFiller = new OrderFiller();
    const result = await orderFiller.fillOrderArgs(order);
    
    if (result.success) {
      console.log(`✅ Order filled successfully using fillOrderArgs`);
      console.log(`📋 Transaction Hash: ${result.txHash}`);
    } else {
      console.error('❌ Fill failed:', result.error);
    }
  } catch (error) {
    console.error(`❌ Error filling order ${orderHash}:`, error);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
const orderHash = args[0];

if (!orderHash) {
  console.error('❌ Usage: bun run fill-order-args.ts <orderHash>');
  process.exit(1);
}

fillOrderWithArgs(orderHash).catch(console.error);
