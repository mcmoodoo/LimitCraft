import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { Address, MakerTraits, randBigInt, Sdk } from '@1inch/limit-order-sdk';
import { JsonRpcProvider, Wallet } from 'ethers';
import { config } from './config';
import { SimpleHttpConnector } from './simpleHttpConnector';
import { createOrder, getAllOrders, getOrderByHash } from '../../db/src/index.js';
import axios from 'axios';
import { createOrderExt } from './lib';

interface LimitOrderRequest {
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  expiresIn?: number;
}

const app = new Elysia()
  .use(
    cors({
      origin: 'http://localhost:5173',
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

      const sdk = new Sdk({
        authKey: config.apiKey,
        networkId: config.networkId,
        httpConnector: new SimpleHttpConnector(),
      });

      // use our own createOrder() with extension
      const order = await createOrderExt(
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
  .listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
