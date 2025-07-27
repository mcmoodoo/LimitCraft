import {
  getLimitOrderContract,
  LimitOrder,
  LimitOrderContract,
  MakerTraits,
  Address,
  Extension,
} from '@1inch/limit-order-sdk';
import { Contract, ethers, parseUnits } from 'ethers';
import { JsonRpcProvider, Wallet } from 'ethers';
import type { Order } from '../../db/src/schema.js';
import { updateOrderStatus } from '../../db/src/index.js';
import { config } from './config.js';
import { createSimpleInteraction, encodeInteraction, buildTakerTraits } from './interaction-utils.js';

interface FillResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

// ABI for the limit order contract with CORRECT order struct field order
const LIMIT_ORDER_ABI = [
  'function fillOrder(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 makerTraits) order, bytes signature, uint256 makingAmount, uint256 takingAmount, uint256 skipPermitAndThresholdAmount) external returns (uint256, uint256, bytes32)',
  'function fillOrderArgs(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 makerTraits) order, bytes32 r, bytes32 vs, uint256 amount, uint256 takerTraits, bytes calldata args) external payable returns (uint256, uint256, bytes32)',
  'function hashOrder(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 makerTraits) order) external view returns(bytes32)',
  'function remainingInvalidatorForOrder(address maker, bytes32 orderHash) external view returns(uint256 remaining)',
];

// Deployed interaction contract address from deployments.json
const INTERACTION_CONTRACT_ADDRESS = '0xd65cef6db48e269d607733950b26cb81bbd27499';

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

      // Check WETH balance and approval
      const wethAddress = order.takerAsset;
      const wethContract = new Contract(wethAddress, [
        'function balanceOf(address) view returns (uint256)',
        'function allowance(address owner, address spender) view returns (uint256)',
        'function approve(address spender, uint256 amount) returns (bool)',
        'function deposit() payable',
      ], this.wallet);
      
      const wethBalance = await wethContract.balanceOf(this.wallet.address);
      console.log(`💰 WETH balance: ${ethers.formatEther(wethBalance)} WETH`);
      
      const requiredWeth = BigInt(order.takingAmount);
      console.log(`🎯 Required WETH: ${ethers.formatEther(requiredWeth)} WETH`);
      
      if (wethBalance < requiredWeth) {
        console.log(`💱 Insufficient WETH, wrapping ${ethers.formatEther(requiredWeth)} ETH to WETH...`);
        const wrapTx = await wethContract.deposit({ value: requiredWeth });
        await wrapTx.wait();
        console.log(`✅ Wrapped ETH to WETH successfully`);
      }
      
      // Check allowance
      const contractAddress = getLimitOrderContract(config.networkId);
      const allowance = await wethContract.allowance(this.wallet.address, contractAddress);
      console.log(`🔐 Current WETH allowance: ${ethers.formatEther(allowance)} WETH`);
      
      if (allowance < requiredWeth) {
        console.log(`🔓 Insufficient allowance, approving WETH spend...`);
        const approveTx = await wethContract.approve(contractAddress, requiredWeth);
        await approveTx.wait();
        console.log(`✅ WETH approval successful`);
      }

      // Reconstruct the limit order
      const limitOrder = this.reconstructLimitOrder(order);
      const orderStruct = this.reconstructOrderStruct(limitOrder);
      
      console.log(`📋 Order struct:`, {
        salt: orderStruct.salt,
        makerAsset: orderStruct.makerAsset,
        takerAsset: orderStruct.takerAsset,
        maker: orderStruct.maker,
        receiver: orderStruct.receiver,
        makingAmount: orderStruct.makingAmount,
        takingAmount: orderStruct.takingAmount,
        offsets: orderStruct.offsets,
        interactions: orderStruct.interactions
      });
      
      // Check if the order is still valid
      console.log(`🔍 Order validation - expected hash: ${order.orderHash}`);
      
      // First verify the order hash computation
      try {
        const computedHash = await this.limitOrderContract.hashOrder(orderStruct);
        console.log(`🔑 Computed hash: ${computedHash}`);
        console.log(`🔑 Expected hash:  ${order.orderHash}`);
        
        if (computedHash.toLowerCase() !== order.orderHash.toLowerCase()) {
          throw new Error(`Order hash mismatch! This means our order reconstruction is wrong.`);
        } else {
          console.log(`✅ Order hash matches - order reconstruction is correct`);
        }
      } catch (hashError: any) {
        console.error(`❌ Error computing order hash:`, hashError.message);
        throw new Error(`Cannot verify order hash: ${hashError.message}`);
      }
      
      // Check remaining amount for the order
      try {
        const remaining = await this.limitOrderContract.remainingInvalidatorForOrder(
          order.makerAddress,
          order.orderHash
        );
        console.log(`📊 Remaining amount for order: ${remaining}`);
        
        if (remaining === 0n) {
          throw new Error('Order is already fully filled or cancelled');
        }
      } catch (remainingError: any) {
        console.error(`❌ Error checking remaining amount:`, remainingError.message);
        // The error 0xaa3eef95 might indicate the order doesn't exist or is invalid
        // Continue anyway to get more specific error from fill attempt
      }
      
      // Create interaction with our deployed contract - but let's try without interaction first
      console.log(`🧪 Testing without interaction first...`);
      
      // Build TakerTraits without interaction for testing
      const testTakerTraitsValue = buildTakerTraits({
        interactionLength: 0,    // No interaction for test
        hasTarget: false,        // No target address in args
        extensionLength: 0,      // No extension data
        threshold: 0n,           // No threshold
        makerAmount: false,      // Amount is taking amount
        unwrapWeth: false,       // Don't unwrap WETH
        skipOrderPermit: false,  // Don't skip permit
        usePermit2: false,       // Don't use permit2
      });
      
      console.log(`🔢 Test TakerTraits value (no interaction): ${testTakerTraitsValue}`);
      
      // Parse signature using ethers Signature utility
      const { r, yParityAndS: vs } = ethers.Signature.from(order.signature);
      
      console.log(`✍️ Signature components - r: ${r}, vs: ${vs}`);

      // Try with different amounts to see if it's an amount issue
      const testAmounts = [
        { name: "Full amount", making: BigInt(order.makingAmount), taking: BigInt(order.takingAmount) },
        { name: "Half amount", making: BigInt(order.makingAmount) / 2n, taking: BigInt(order.takingAmount) / 2n },
        { name: "Tiny amount", making: 1n, taking: 1000000000000000000n }, // 1 wei USDC for 1 ETH
      ];

      let workingAmount = null;
      
      for (const testAmount of testAmounts) {
        try {
          console.log(`🧪 Testing with ${testAmount.name} - making: ${testAmount.making}, taking: ${testAmount.taking}...`);
          await this.limitOrderContract.fillOrderArgs.staticCall(
            orderStruct,
            r,
            vs,
            testAmount.taking,
            testTakerTraitsValue,
            '0x' // Empty args
          );
          console.log(`✅ ${testAmount.name} succeeded!`);
          workingAmount = testAmount;
          break;
        } catch (testError: any) {
          console.error(`❌ ${testAmount.name} failed:`, testError.reason || testError.message);
        }
      }
      
      if (!workingAmount) {
        throw new Error('All test amounts failed - order appears to be invalid');
      }

      // Call fillOrderArgs directly on the contract (without interaction for now)
      
      const tx = await this.limitOrderContract.fillOrderArgs(
        orderStruct,
        r,
        vs,
        BigInt(order.takingAmount), // Amount to fill
        testTakerTraitsValue,
        '0x', // Empty args for now
        {
          gasLimit: 1_000_000,
          maxFeePerGas: parseUnits('50', 'gwei'),
          maxPriorityFeePerGas: parseUnits('2', 'gwei'),
        }
      );

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

    // CORRECT field order matching IOrderMixin.Order struct:
    // salt, maker, receiver, makerAsset, takerAsset, makingAmount, takingAmount, makerTraits
    return {
      salt: BigInt(orderStruct.salt),
      maker: String(orderStruct.maker),
      receiver: orderStruct.receiver ? String(orderStruct.receiver) : ZERO_ADDRESS,
      makerAsset: String(orderStruct.makerAsset),
      takerAsset: String(orderStruct.takerAsset),
      makingAmount: BigInt(orderStruct.makingAmount),
      takingAmount: BigInt(orderStruct.takingAmount),
      makerTraits: BigInt(orderStruct.makerTraits),
    };
  }
}