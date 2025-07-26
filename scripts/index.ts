import {
  Address,
  LimitOrder,
  LimitOrderWithFee,
  OrderInfoData,
  Extension,
  FeeTakerExt,
  Bps,
  MakerTraits,
  randBigInt,
  Sdk,
  Api,
  Interaction,
} from '@1inch/limit-order-sdk';
import { JsonRpcProvider, Wallet } from 'ethers';
import { config } from './config';
import { SimpleHttpConnector } from './simpleHttpConnector';

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

const order = await createLimitOrderUsingApi().catch(console.error);

async function createLimitOrderWithInteraction(): Promise<LimitOrder> {
  // Create preInteraction with specific contract
  const preInteraction = new Interaction(
    new Address('0x1234567890123456789012345678901234567890'), // Contract to call
    '0xabcdef01234567890' // Call data (method + params)
  );

  // Add to extension
  const extension = new ExtensionBuilder().withPreInteraction(preInteraction).build();
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

  const makerTraits = MakerTraits.default()
    .withExpiration(expiration)
    .withNonce(randBigInt(UINT_40_MAX))
    .allowMultipleFills()
    .withExtension();

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
  console.log(`📋 Order extension: ${order.extension.encode()}`);
  console.log(`📋 Order maker traits: ${order.makerTraits.asBigInt()}`);

  const typedData = order.getTypedData(config.networkId);
  const signature = await maker.signTypedData(
    typedData.domain,
    { Order: typedData.types.Order },
    typedData.message
  );

  await sdk.submitOrder(order, signature);
  console.log('✅ Order submitted successfully!');
  console.log(`🔍 Order Hash: ${orderHash}`);

  return order;
}

// createLimitOrderUsingSdk().catch(console.error);
