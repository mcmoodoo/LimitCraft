import {
  Address,
  Extension,
  LimitOrder,
  MakerTraits,
  randBigInt,
  Interaction,
  ExtensionBuilder,
} from '@1inch/limit-order-sdk';
import { JsonRpcProvider, Wallet } from 'ethers';
import { createOrder } from '../db/src/index.js';

const PRIV_KEY = process.env.PRIV_KEY ?? (() => { throw new Error('PRIV_KEY not set'); })();

// Config extracted from api/src/config.ts
const config = {
  rpcUrl: 'http://localhost:8545',
  networkId: 42161, // Keep Arbitrum network ID since we forked it
  tokens: {
    USDC: '0x55730859aa4204834e132c704090057924db4b2c',
    WETH: '0x8a8c8fb21f3099e787b5ad1221310663d73b1d81',
  }
};

// Interfaces extracted from SignatureService
interface SignedOrderRequest {
  orderHash: string;
  signature: string;
  makerTraits: string;
  chainId: number;
  typedData: {
    domain: any;
    types: any;
    message: any;
  };
  extension?: string;
}

// Order validation extracted from OrderValidationService
function validateSignedOrder(reconstructedOrder: any, signedOrderRequest: SignedOrderRequest) {
  try {
    // Validate chain ID
    if (signedOrderRequest.chainId !== config.networkId) {
      return {
        isValid: false,
        error: `Invalid chain ID. Expected ${config.networkId}, got ${signedOrderRequest.chainId}`
      };
    }

    // Validate order hash
    const calculatedHash = reconstructedOrder.order.getOrderHash(config.networkId);
    if (calculatedHash.toLowerCase() !== signedOrderRequest.orderHash.toLowerCase()) {
      return {
        isValid: false,
        error: 'Order hash mismatch'
      };
    }

    // Validate expiration
    const now = new Date();
    if (reconstructedOrder.expiresIn <= now) {
      return {
        isValid: false,
        error: 'Order has expired'
      };
    }

    // Validate amounts
    if (reconstructedOrder.order.makingAmount <= 0n || reconstructedOrder.order.takingAmount <= 0n) {
      return {
        isValid: false,
        error: 'Invalid order amounts'
      };
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

const printLimitOrderDetails = async (limitOrder: LimitOrder) => {

  console.log('📋 LimitOrder Analysis:');
  console.log('- Order Hash:', limitOrder.getOrderHash(config.networkId));
  console.log('- Maker:', limitOrder.maker.toString());
  console.log('- Receiver:', limitOrder.receiver.toString());
  console.log('- MakerAsset:', limitOrder.makerAsset.toString());
  console.log('- TakerAsset:', limitOrder.takerAsset.toString());
  console.log('- MakingAmount:', limitOrder.makingAmount.toString());
  console.log('- TakingAmount:', limitOrder.takingAmount.toString());
  console.log('- Salt:', limitOrder.salt.toString());
  console.log('- MakerTraits:', limitOrder.makerTraits.asBigInt().toString());
  console.log('- Extension encoded:', limitOrder.extension.encode());
  console.log('- Extension details:', {
    isEmpty: limitOrder.extension.isEmpty(),
    preInteraction: limitOrder.extension.preInteraction,
    postInteraction: limitOrder.extension.postInteraction,
    predicate: limitOrder.extension.predicate,
    makerPermit: limitOrder.extension.makerPermit,
    customData: limitOrder.extension.customData,
  });

}

// Order reconstruction extracted from SignatureService
function reconstructFromSignedData(signedOrderRequest: SignedOrderRequest) {
  try {
    // IMPORTANT: Must use Extension.decode() for the extension if provided
    let extension = Extension.default();
    if (signedOrderRequest.extension) {
      extension = Extension.decode(signedOrderRequest.extension);
    }

    // Print extension details and exit
    console.log('🔍 Extension Analysis:');
    console.log('- Extension encoded:', extension.encode());
    console.log('- Extension isEmpty:', extension.isEmpty());
    console.log('- Extension details:', {
      makerAssetSuffix: extension.makerAssetSuffix,
      takerAssetSuffix: extension.takerAssetSuffix,
      makingAmountData: extension.makingAmountData,
      takingAmountData: extension.takingAmountData,
      predicate: extension.predicate,
      makerPermit: extension.makerPermit,
      preInteraction: extension.preInteraction,
      postInteraction: extension.postInteraction,
      customData: extension.customData,
    });

    const order = new LimitOrder(
      {
        salt: BigInt(signedOrderRequest.typedData.message.salt),
        receiver: new Address(signedOrderRequest.typedData.message.receiver),
        makerAsset: new Address(signedOrderRequest.typedData.message.makerAsset),
        takerAsset: new Address(signedOrderRequest.typedData.message.takerAsset),
        makingAmount: BigInt(signedOrderRequest.typedData.message.makingAmount),
        takingAmount: BigInt(signedOrderRequest.typedData.message.takingAmount),
        maker: new Address(signedOrderRequest.typedData.message.maker),
      },
      new MakerTraits(BigInt(signedOrderRequest.makerTraits)),
      extension
    );

    printLimitOrderDetails(order);

    const orderHash = order.getOrderHash(config.networkId);
    const expirationTimestamp = order.makerTraits.expiration();
    const expiresIn = new Date(Number(expirationTimestamp) * 1000);

    return {
      order,
      orderHash,
      expiresIn,
    };
  } catch (error) {
    throw new Error(`Failed to reconstruct order from signed data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Extract order data for database storage
function extractOrderData(reconstructedOrder: any, signedOrderRequest: SignedOrderRequest) {
  const { order, orderHash, expiresIn } = reconstructedOrder;

  return {
    orderHash,
    salt: signedOrderRequest.typedData.message.salt,
    makerAsset: order.makerAsset.toString(),
    takerAsset: order.takerAsset.toString(),
    makingAmount: order.makingAmount.toString(),
    takingAmount: order.takingAmount.toString(),
    makerAddress: order.maker.toString(),
    expiresIn,
    signature: signedOrderRequest.signature,
    makerTraits: order.makerTraits.asBigInt().toString(),
    extension: order.extension.encode(),
  };
}

async function createAndSaveOrder(): Promise<string> {
  console.log('🚀 Creating signed order...');

  const provider = new JsonRpcProvider(config.rpcUrl);
  const maker = new Wallet(PRIV_KEY, provider);
  
  const expiresIn = 300; // 5 minutes (in seconds)
  const expiration = BigInt(Math.floor(Date.now() / 1000)) + BigInt(expiresIn);
  const UINT_40_MAX = (1n << 40n) - 1n;
  const nonce = randBigInt(UINT_40_MAX);

  console.log('📋 Order parameters:');
  console.log(`  - Maker: ${maker.address}`);
  console.log(`  - Making: 50 USDC (${config.tokens.USDC})`);
  console.log(`  - Taking: 0.02 WETH (${config.tokens.WETH})`);
  console.log(`  - Expires: ${new Date(Number(expiration) * 1000).toISOString()}`);
  console.log(`  - Nonce: ${nonce}`);

  // Create MakerTraits exactly like UI does
  const makerTraits = MakerTraits.default()
    .withExpiration(expiration)
    .enablePreInteraction()
    .withNonce(nonce)
    .allowMultipleFills();

  const preInteraction = new Interaction(
    new Address('0xb6cc00b69bff1d88747a15ab39bf811ed7118f17'), // target contract
    '0x32e43a11', // optional extraData only (NO selector here)
    // '0xabcdef01234567890',
  )

  // const extension = Extension.default(); // This is key - matches UI exactly
  const ext = new ExtensionBuilder().withPreInteraction(preInteraction).build();

  // Create LimitOrder exactly like UI does (with Extension.default())
  const limitOrder = new LimitOrder(
    {
      makerAsset: new Address(config.tokens.USDC),
      takerAsset: new Address(config.tokens.WETH),
      makingAmount: 50_000000n, // 50 USDC (6 decimals)
      takingAmount: 20_000000000000000n, // 0.02 WETH (18 decimals)
      maker: new Address(maker.address),
    },
    makerTraits,
    ext
  );

  // Print limitOrder details
  printLimitOrderDetails(limitOrder);

  // Get order hash and typed data exactly like UI
  const orderHash = limitOrder.getOrderHash(config.networkId);
  const typedData = limitOrder.getTypedData(config.networkId);
  
  console.log('✍️ Signing typed data...');
  const signature = await maker.signTypedData(
    typedData.domain,
    { Order: typedData.types.Order },
    typedData.message
  );

  // Convert BigInt values to strings for JSON serialization (like UI does)
  const typedDataForJson = JSON.parse(
    JSON.stringify(typedData, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );

  // Create SignedOrderRequest exactly like UI does
  const signedOrderRequest: SignedOrderRequest = {
    orderHash: orderHash,
    signature: signature,
    makerTraits: makerTraits.asBigInt().toString(),
    chainId: config.networkId,
    typedData: typedDataForJson,
    extension: limitOrder.extension.encode(),
  };

  console.log('💾 Processing signed order...');
  
  try {
    // Step 1: Reconstruct order from signed data
    const reconstructedOrder = reconstructFromSignedData(signedOrderRequest);

    // Step 2: Validate the order
    const validationResult = validateSignedOrder(reconstructedOrder, signedOrderRequest);
    
    if (!validationResult.isValid) {
      throw new Error(validationResult.error || 'Order validation failed');
    }

    // Step 3: Extract data for database storage
    const orderData = extractOrderData(reconstructedOrder, signedOrderRequest);

    // Step 4: Save to database
    const savedOrder = await createOrder(orderData);

    console.log('✅ Order created and saved successfully!');
    console.log(`📋 Order Hash: ${reconstructedOrder.orderHash}`);
    console.log(`🆔 Database ID: ${savedOrder.id}`);
    console.log(`⛓️ Chain ID: ${signedOrderRequest.chainId}`);
    
    return reconstructedOrder.orderHash;
  } catch (error) {
    console.error('❌ Error processing signed order:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to process signed order');
  }
}

createAndSaveOrder()
  .then((orderHash) => {
    console.log(`\n🎯 Use this hash to fill the order:`);
    console.log(`bun run fill-order.ts ${orderHash}`);
  })
  .catch(console.error);
