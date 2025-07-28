import {
  Address,
  Api,
  Bps,
  Extension,
  FeeTakerExt,
  Interaction,
  LimitOrder,
  LimitOrderWithFee,
  MakerTraits,
  type OrderInfoData,
  randBigInt,
  Sdk,
  ExtensionBuilder
} from '@1inch/limit-order-sdk';
import { JsonRpcProvider, Wallet } from 'ethers';
import { config } from './config';
import { SimpleHttpConnector } from './simpleHttpConnector';
import { createOrder } from '../db/src/index.js';

const createLimitOrderUsingApi = async (): Promise<LimitOrder> => {
  if (!config.apiKey) {
    throw new Error('API key is required. Set ONE_INCH_API_KEY environment variable.');
  }

  const provider = new JsonRpcProvider(config.rpcUrl);
  const maker = new Wallet(config.privateKey, provider);
  const expiresIn = 120n; // 2 minutes
  const expiration = BigInt(Math.floor(Date.now() / 1000)) + expiresIn;
  const UINT_40_MAX = (1n << 40n) - 1n;

  const makerTraits = MakerTraits.default()
    .withExpiration(expiration)
    .withNonce(randBigInt(UINT_40_MAX))
    .allowMultipleFills()
    .withExtension();

  const api = new Api({
    baseUrl: 'https://api.1inch.dev/orderbook/v4.0',
    authKey: config.apiKey,
    networkId: config.networkId,
    httpConnector: new SimpleHttpConnector(),
  });

  const orderInfo: OrderInfoData = {
    makerAsset: new Address(config.tokens.USDC),
    takerAsset: new Address(config.tokens.WETH),
    makingAmount: 100_000000n, // 100 USDC
    takingAmount: 10_00000000000000n, // 0.01 WETH
    maker: new Address(maker.address),
  };

  const feeParams = await api.getFeeParams({
    makerAsset: orderInfo.makerAsset,
    takerAsset: orderInfo.takerAsset,
    makerAmount: orderInfo.makingAmount,
    takerAmount: orderInfo.takingAmount,
  });

  const fees = new FeeTakerExt.Fees(
    new FeeTakerExt.ResolverFee(
      new Address(feeParams.protocolFeeReceiver),
      new Bps(BigInt(feeParams.feeBps)),
      Bps.fromPercent(feeParams.whitelistDiscountPercent)
    ),
    FeeTakerExt.IntegratorFee.ZERO
  );

  console.log(`Extension address: ${feeParams.extensionAddress}`);

  const feeExt = FeeTakerExt.FeeTakerExtension.new(
    new Address(feeParams.extensionAddress),
    fees,
    Object.values(feeParams.whitelist).map((w) => new Address(w)),
    {
      // ...extra,
      customReceiver: orderInfo.receiver,
    }
  );

  const order = new LimitOrderWithFee(orderInfo, makerTraits, feeExt);

  const orderHash = order.getOrderHash(config.networkId);

  const typedData = order.getTypedData(config.networkId);
  const signature = await maker.signTypedData(
    typedData.domain,
    { Order: typedData.types.Order },
    typedData.message
  );

  // api.submitOrder(order, signature);

  console.log(`📋 Order hash: ${orderHash}`);
  console.log(`📋 Order extension: ${order.extension.encode()}`);
  console.log(`📋 Order maker traits: ${order.makerTraits.asBigInt()}`);

  return order;
};

async function createLimitOrderWithInteraction(): Promise<LimitOrder> {
  if (!config.apiKey) {
    throw new Error('API key is required. Set ONE_INCH_API_KEY environment variable.');
  }

  const provider = new JsonRpcProvider(config.rpcUrl);
  const maker = new Wallet(config.privateKey, provider);
  const expiresIn = 120n; // 2 minutes
  const expiration = BigInt(Math.floor(Date.now() / 1000)) + expiresIn;
  const UINT_40_MAX = (1n << 40n) - 1n;

  const makerTraits = MakerTraits.default()
    .withExpiration(expiration)
    .withNonce(randBigInt(UINT_40_MAX))
    .allowMultipleFills()
    .withExtension();

  // Create preInteraction with specific contract
  const preInteraction = new Interaction(
    new Address('0xd65cef6db48e269d607733950b26cb81bbd27499'), // target contract
    '0xabcdef' // optional extraData only (NO selector here)
    // '0xabcdef01234567890' // Call data (method + params)
  )
  const extension = new ExtensionBuilder()
    .withPreInteraction(preInteraction)
    // .withCustomData('0xdeadbeef')
    .build();

  const orderInfo: OrderInfoData = {
    makerAsset: new Address(config.tokens.USDC),
    takerAsset: new Address(config.tokens.WETH),
    makingAmount: 100_000000n, // 100 USDC
    takingAmount: 10_00000000000000n, // 0.01 WETH
    maker: new Address(maker.address),
  };

  // Create order with custom extension
  const order = new LimitOrder(orderInfo, makerTraits);

  const orderHash = order.getOrderHash(config.networkId);

  const typedData = order.getTypedData(config.networkId);
  const signature = await maker.signTypedData(
    typedData.domain,
    { Order: typedData.types.Order },
    typedData.message
  );

  console.log(`📋 Order hash: ${orderHash}`);
  console.log(`📋 Order extension: ${order.extension.encode()}`);
  console.log(`📋 Order maker traits: ${order.makerTraits.asBigInt()}`);

  await saveLimitOrderToDatabase(order, signature);
  
  return order;
}

async function createLimitOrderUsingSdk(): Promise<LimitOrder> {
  if (!config.apiKey) {
    throw new Error('API key is required. Set ONE_INCH_API_KEY environment variable.');
  }

  const provider = new JsonRpcProvider(config.rpcUrl);
  const maker = new Wallet(config.privateKey, provider);
  const expiresIn = 120n; // 2 minutes
  const expiration = BigInt(Math.floor(Date.now() / 1000)) + expiresIn;
  const UINT_40_MAX = (1n << 40n) - 1n;
  const nonce = randBigInt(UINT_40_MAX);

  console.log(`Generated a nonce of ${nonce}`);

  const makerTraits = MakerTraits.default()
    .withExpiration(expiration)
    .withNonce(nonce)
    .allowMultipleFills()
    .withExtension();

  console.log(
    `dummy makerTraits: ${MakerTraits.default().withExpiration(expiration).withNonce(nonce).allowMultipleFills().withExtension().asBigInt()}`
  );
  console.log(`makeTraits var = ${makerTraits.asBigInt()}`);

  const sdk = new Sdk({
    authKey: config.apiKey,
    networkId: config.networkId,
    httpConnector: new SimpleHttpConnector(),
  });

  const order = await sdk.createOrder(
    {
      makerAsset: new Address(config.tokens.USDC),
      takerAsset: new Address(config.tokens.WETH),
      makingAmount: 100_000000n, // 100 USDC
      takingAmount: 10_00000000000000n, // 0.01 WETH
      maker: new Address(maker.address),
    },
    makerTraits
  );

  const orderHash = order.getOrderHash(config.networkId);
  console.log(`📋 Order hash: ${orderHash}`);

  console.log(`📋 Order build(): ${JSON.stringify(order.build(), null, 2)}`);
  console.log(`📋 Order extension: ${order.extension.encode()}`);
  console.log(`📋 Order maker traits: ${order.makerTraits.asBigInt()}`);

  const typedData = order.getTypedData(config.networkId);
  const signature = await maker.signTypedData(
    typedData.domain,
    { Order: typedData.types.Order },
    typedData.message
  );

  console.log(`📋 typeData: ${JSON.stringify(typedData)}`);
  console.log(`📋 Signature: ${signature}`);

  // await sdk.submitOrder(order, signature);
  // console.log('✅ Order submitted successfully!');

  return order;
}

async function saveLimitOrderToDatabase(order: LimitOrder, signature: string): Promise<void> {
  try {
    const orderHash = order.getOrderHash(config.networkId);
    const expirationTimestamp = order.makerTraits.expiration();
    const expiresIn = new Date(Number(expirationTimestamp) * 1000);

    console.log('🗄️ Saving order to database...');
    console.log(`  - Order Hash: ${orderHash}`);
    console.log(`  - Maker: ${order.maker.toString()}`);
    console.log(`  - Making Amount: ${order.makingAmount.toString()}`);
    console.log(`  - Taking Amount: ${order.takingAmount.toString()}`);
    console.log(`  - Expires: ${expiresIn.toISOString()}`);

    const savedOrder = await createOrder({
      orderHash,
      salt: order.salt.toString(),
      makerAsset: order.makerAsset.toString(),
      takerAsset: order.takerAsset.toString(),
      makingAmount: order.makingAmount.toString(),
      takingAmount: order.takingAmount.toString(),
      makerAddress: order.maker.toString(),
      expiresIn,
      signature,
      makerTraits: order.makerTraits.asBigInt().toString(),
      extension: order.extension.encode(),
    });

    console.log(`✅ Order saved to database with ID: ${savedOrder.id}`);
  } catch (error) {
    console.error('❌ Error saving order to database:', error);
    throw error;
  }
}

// const order = await createLimitOrderUsingApi().catch(console.error);
createLimitOrderWithInteraction().catch(console.error);
