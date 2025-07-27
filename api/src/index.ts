import { Address, MakerTraits, randBigInt, Sdk, Api, LimitOrder } from '@1inch/limit-order-sdk';
import { cors } from '@elysiajs/cors';
import axios from 'axios';
import { Elysia } from 'elysia';
import { JsonRpcProvider, Wallet } from 'ethers';
import { createOrder, getAllOrders, getOrderByHash } from '../../db/src/index.js';
import { config } from './config';
import { buildOrderExt, createOrderExt } from './lib';
import { SimpleHttpConnector } from './simpleHttpConnector';

interface LimitOrderRequest {
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  expiresIn?: number;
}

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

const app = new Elysia()
  .use(
    cors({
      origin: true, // Allow all origins for debugging
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true, // for cookies or Authorization headers
    })
  )
  .get('/', () => 'Hello Elysia')
  .get('/order/:orderHash', async ({ params }) => {
    try {
      const order = await getOrderByHash(params.orderHash);

      if (!order) {
        return {
          success: false,
          error: 'Order not found',
        };
      }

      // Transform database structure to match frontend expectations
      const transformedOrder = {
        orderHash: order.orderHash,
        createDateTime: order.createdAt.toISOString(),
        remainingMakerAmount: order.makingAmount,
        makerBalance: '999999999999999999999',
        makerAllowance: '999999999999999999999',
        data: {
          makerAsset: order.makerAsset,
          takerAsset: order.takerAsset,
          makingAmount: order.makingAmount,
          takingAmount: order.takingAmount,
          maker: order.makerAddress,
        },
        orderInvalidReason: order.status === 'expired' ? 'Expired' : undefined,
        signature: order.signature,
      };

      return {
        success: true,
        data: transformedOrder,
      };
    } catch (error) {
      console.error('Error fetching order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  })
  .get('/orders', async ({ query }) => {
    try {
      const limit = parseInt(query.limit || '100');
      const offset = (parseInt(query.page || '1') - 1) * limit;

      const orders = await getAllOrders(limit, offset);

      // Transform database structure to match frontend expectations
      const transformedOrders = orders.map((order) => ({
        orderHash: order.orderHash,
        createDateTime: order.createdAt.toISOString(),
        remainingMakerAmount: order.makingAmount, // Simplified - could be calculated based on fills
        makerBalance: '999999999999999999999', // Placeholder - would need to query blockchain
        makerAllowance: '999999999999999999999', // Placeholder - would need to query blockchain
        data: {
          makerAsset: order.makerAsset,
          takerAsset: order.takerAsset,
          makingAmount: order.makingAmount,
          takingAmount: order.takingAmount,
          maker: order.makerAddress,
        },
        orderInvalidReason: order.status === 'expired' ? 'Expired' : undefined,
        signature: order.signature,
      }));

      return {
        success: true,
        data: transformedOrders,
      };
    } catch (error) {
      console.error('Error fetching orders:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  })
  .post('/limit-order', async ({ body }: { body: LimitOrderRequest }) => {
    try {
      if (!config.apiKey) {
        throw new Error('API key is required. Set ONE_INCH_API_KEY environment variable.');
      }

      const provider = new JsonRpcProvider(config.rpcUrl);
      const maker = new Wallet(config.privateKey, provider);
      const expiresIn = BigInt(body.expiresIn || 120); // Default 2 minutes
      const expiration = BigInt(Math.floor(Date.now() / 1000)) + expiresIn;
      const UINT_40_MAX = (1n << 40n) - 1n;

      const makerTraits = MakerTraits.default()
        .withExpiration(expiration)
        .withNonce(randBigInt(UINT_40_MAX))
        .allowMultipleFills();

      const sdk = new Sdk({
        authKey: config.apiKey,
        networkId: config.networkId,
        httpConnector: new SimpleHttpConnector(),
      });

      const order = await sdk.createOrder(
        {
          makerAsset: new Address(body.makerAsset),
          takerAsset: new Address(body.takerAsset),
          makingAmount: BigInt(body.makingAmount),
          takingAmount: BigInt(body.takingAmount),
          maker: new Address(maker.address),
        },
        makerTraits
      );

      const orderHash = order.getOrderHash(config.networkId);
      const typedData = order.getTypedData(config.networkId);
      const signature = await maker.signTypedData(
        typedData.domain,
        { Order: typedData.types.Order },
        typedData.message
      );

      console.log('🔍 Token addresses being saved to database:');
      console.log('  - makerAsset:', body.makerAsset);
      console.log('  - takerAsset:', body.takerAsset);

      const savedOrder = await createOrder({
        orderHash,
        makerAsset: body.makerAsset,
        takerAsset: body.takerAsset,
        makingAmount: body.makingAmount,
        takingAmount: body.takingAmount,
        makerAddress: maker.address,
        expiresIn: new Date(Number(expiration) * 1000),
        signature,
        makerTraits: makerTraits.asBigInt().toString(),
        extension: order.extension.encode(),
      });

      return {
        success: true,
        orderHash,
        orderId: savedOrder.id,
        extension: order.extension.encode(),
        message: 'Order saved successfully!',
      };
    } catch (error) {
      console.error('Error creating limit order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  })
  .post('/limit-order-ext', async ({ body }: { body: LimitOrderRequest }) => {
    try {
      if (!config.apiKey) {
        throw new Error('API key is required. Set ONE_INCH_API_KEY environment variable.');
      }

      const provider = new JsonRpcProvider(config.rpcUrl);
      const maker = new Wallet(config.privateKey, provider);
      const expiresIn = BigInt(body.expiresIn || 120); // Default 2 minutes
      const expiration = BigInt(Math.floor(Date.now() / 1000)) + expiresIn;
      const UINT_40_MAX = (1n << 40n) - 1n;

      const makerTraits = MakerTraits.default()
        .withExpiration(expiration)
        .withNonce(randBigInt(UINT_40_MAX))
        .allowMultipleFills()
        .withExtension();

      // use our own buildOrderExt() to set extension
      const order = await buildOrderExt(
        {
          makerAsset: new Address(body.makerAsset),
          takerAsset: new Address(body.takerAsset),
          makingAmount: BigInt(body.makingAmount),
          takingAmount: BigInt(body.takingAmount),
          maker: new Address(maker.address),
        },
        makerTraits
      );

      const orderHash = order.getOrderHash(config.networkId);
      const typedData = order.getTypedData(config.networkId);
      const signature = await maker.signTypedData(
        typedData.domain,
        { Order: typedData.types.Order },
        typedData.message
      );

      console.log('  - extension:', order.extension.encode());

      const savedOrder = await createOrder({
        orderHash,
        makerAsset: body.makerAsset,
        takerAsset: body.takerAsset,
        makingAmount: body.makingAmount,
        takingAmount: body.takingAmount,
        makerAddress: maker.address,
        expiresIn: new Date(Number(expiration) * 1000),
        signature,
        makerTraits: makerTraits.asBigInt().toString(),
        extension: order.extension.encode(),
      });

      return {
        success: true,
        orderHash,
        orderId: savedOrder.id,
        extension: order.extension.encode(),
        message: 'Order saved successfully!',
      };
    } catch (error) {
      console.error('Error creating limit order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  })
  .post('/submit-signed-order', async ({ body }: { body: SignedOrderRequest }) => {
    console.log('🌐 POST /submit-signed-order endpoint hit!');
    console.log('📦 Full Request Data:');
    console.log('=====================================');
    
    try {
      // Print all order details
      console.log('🔍 Order Details:');
      console.log('  - Order Hash:', body.orderHash);
      console.log('  - Chain ID:', body.chainId);
      console.log('  - Extension:', body.extension || 'None');
      
      console.log('\n📝 EIP-712 Signature:');
      console.log('  - Signature:', body.signature);
      console.log('  - Length:', body.signature.length);
      
      console.log('\n🏗️ EIP-712 Domain:');
      console.log('  - Name:', body.typedData.domain.name);
      console.log('  - Version:', body.typedData.domain.version);
      console.log('  - Chain ID:', body.typedData.domain.chainId);
      console.log('  - Verifying Contract:', body.typedData.domain.verifyingContract);
      
      console.log('\n📋 EIP-712 Types:');
      console.log('  - Order Fields:', body.typedData.types.Order.map(field => `${field.name}: ${field.type}`).join(', '));
      
      console.log('\n💼 Order Message Data:');
      console.log('  - Salt:', body.typedData.message.salt);
      console.log('  - Maker:', body.typedData.message.maker);
      console.log('  - Receiver:', body.typedData.message.receiver);
      console.log('  - Maker Asset:', body.typedData.message.makerAsset);
      console.log('  - Taker Asset:', body.typedData.message.takerAsset);
      console.log('  - Making Amount:', body.typedData.message.makingAmount);
      console.log('  - Taking Amount:', body.typedData.message.takingAmount);
      console.log('  - Maker Traits (raw):', body.typedData.message.makerTraits);
      
      // Parse and decode the makerTraits using 1inch SDK
      console.log('\n📊 Decoded MakerTraits:');
      try {
        const makerTraits = new MakerTraits(BigInt(body.makerTraits));
        
        console.log('  - Nonce/Epoch:', makerTraits.nonceOrEpoch().toString());
        console.log('  - Expiration:', makerTraits.expiration());
        console.log('  - Is Private:', makerTraits.isPrivate());
        console.log('  - Multiple Fills Allowed:', makerTraits.isMultipleFillsAllowed());
        console.log('  - Partial Fills Allowed:', makerTraits.isPartialFillAllowed());
        console.log('  - Has Extension:', makerTraits.hasExtension());
        console.log('  - Allowed Sender:', makerTraits.allowedSender());
        
        if (makerTraits.expiration()) {
          const expirationDate = new Date(Number(makerTraits.expiration()) * 1000);
          console.log('  - Expiration Date:', expirationDate.toISOString());
          console.log('  - Time Until Expiry:', Math.round((expirationDate.getTime() - Date.now()) / 1000), 'seconds');
        }
        
      } catch (parseError) {
        console.error('❌ Error parsing MakerTraits:', parseError);
      }
      
      console.log('\n=====================================');
      console.log('✅ Signed order successfully received and processed!');


      const order = new LimitOrder(
        {
          salt: body.typedData.message.salt,
          receiver: new Address(body.typedData.message.receiver),
          makerAsset: new Address(body.typedData.message.makerAsset),
          takerAsset: new Address(body.typedData.message.takerAsset),
          makingAmount: BigInt(body.typedData.message.makingAmount),
          takingAmount: BigInt(body.typedData.message.takingAmount),
          maker: new Address(body.typedData.message.maker),
        },
        new MakerTraits(BigInt(body.makerTraits))
      );

      const orderHash = order.getOrderHash(config.networkId);
      console.log(`📋 Order hash: ${orderHash}`);
      console.log(`📋 Order build(): ${JSON.stringify(order.build(), null, 2)}`);
      console.log(`📋 Order extension: ${order.extension.encode()}`);
      console.log(`📋 Order maker traits: ${order.makerTraits.asBigInt()}`);

      // const api = new Api({
      //   baseUrl: 'https://api.1inch.dev/orderbook/v4.0',
      //   authKey: config.apiKey,
      //   networkId: body.chainId,
      //   httpConnector: new SimpleHttpConnector(),
      // });
      // await api.submitOrder(order, body.signature);
      
      return {
        success: true,
        message: 'Signed order received and logged to terminal',
        data: {
          orderHash: body.orderHash,
          chainId: body.chainId,
          processed: true,
        }
      };
      
    } catch (error) {
      console.error('❌ Error processing signed order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  })
  .listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
