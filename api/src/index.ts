import { Address, Api, LimitOrder, MakerTraits, randBigInt, Sdk } from '@1inch/limit-order-sdk';
import { cors } from '@elysiajs/cors';
import axios from 'axios';
import { Elysia } from 'elysia';
import { JsonRpcProvider, Wallet } from 'ethers';
import { createOrder, getAllOrders, getOrderByHash, updateOrderStatus } from '../../db/src/index.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, lt } from 'drizzle-orm';
import postgres from 'postgres';
import { orders } from '../../db/src/schema.js';
import { config } from './config';
import { buildOrderExt } from './lib';
import { SimpleHttpConnector } from './simpleHttpConnector';
import { APIOrderFiller } from './filler.js';

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

// Database connection for order refresh functionality
const connectionString = `postgresql://postgres:postgres@localhost:5432/our-limit-order-db`;
const dbClient = postgres(connectionString, { max: 5 });
const db = drizzle(dbClient);

// Function to refresh expired orders
async function refreshExpiredOrders(): Promise<{ expiredCount: number; message: string }> {
  try {
    const currentTime = new Date();
    
    // Update all pending orders that have expired
    const result = await db
      .update(orders)
      .set({
        status: 'expired',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.status, 'pending'),
          lt(orders.expiresIn, currentTime) // Expiration time < current time
        )
      );

    const expiredCount = result.length || 0;
    
    console.log(`⏰ Refreshed ${expiredCount} expired orders`);
    
    return {
      expiredCount,
      message: expiredCount > 0 
        ? `Successfully marked ${expiredCount} orders as expired`
        : 'No expired orders found'
    };
  } catch (error) {
    console.error('❌ Error refreshing expired orders:', error);
    throw new Error(`Failed to refresh orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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
        status: order.status, // Add actual database status
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

      try {
        await refreshExpiredOrders();
      } catch (error) {
        console.error('Error refreshing orders:', error);
      }

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
        status: order.status, // Add actual database status
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
        salt: order.salt.toString(),
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
        salt: order.salt.toString(),
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
    try {
      // Reconstruct the LimitOrder from the signed data
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

      // Calculate order hash and expiration
      const orderHash = order.getOrderHash(config.networkId);
      const expirationTimestamp = order.makerTraits.expiration();
      const expiresIn = new Date(Number(expirationTimestamp) * 1000);

      // Save to database
      const savedOrder = await createOrder({
        orderHash: orderHash,
        salt: body.typedData.message.salt,
        makerAsset: order.makerAsset.toString(),
        takerAsset: order.takerAsset.toString(),
        makingAmount: order.makingAmount.toString(),
        takingAmount: order.takingAmount.toString(),
        makerAddress: order.maker.toString(),
        expiresIn: expiresIn,
        signature: body.signature,
        makerTraits: order.makerTraits.asBigInt().toString(),
        extension: order.extension.encode(),
      });

      return {
        success: true,
        message: 'Signed order saved successfully',
        data: {
          orderHash: orderHash,
          orderId: savedOrder.id,
          chainId: body.chainId,
        },
      };
    } catch (error) {
      console.error('Error processing signed order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  })
  .post('/order/:orderHash/fill', async ({ params }) => {
    try {
      const { orderHash } = params;
      
      // Get order from database
      const order = await getOrderByHash(orderHash);
      
      if (!order) {
        return {
          success: false,
          error: 'Order not found',
        };
      }
      
      if (order.status !== 'pending') {
        return {
          success: false,
          error: `Order is not pending. Current status: ${order.status}`,
        };
      }
      
      // Create OrderFiller instance for this request
      const orderFiller = new APIOrderFiller();
      
      // Attempt to fill the order using the resolver logic
      const fillResult = await orderFiller.fillOrder(order);
      
      if (fillResult.success) {
        return {
          success: true,
          message: 'Order filled successfully',
          txHash: fillResult.txHash,
        };
      } else {
        return {
          success: false,
          error: fillResult.error || 'Failed to fill order',
        };
      }
      
    } catch (error) {
      console.error('Error filling order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  })
  .post('/order/:orderHash/fill-args', async ({ params }) => {
    try {
      const { orderHash } = params;
      
      // Get order from database
      const order = await getOrderByHash(orderHash);
      
      if (!order) {
        return {
          success: false,
          error: 'Order not found',
        };
      }
      
      if (order.status !== 'pending') {
        return {
          success: false,
          error: `Order is not pending. Current status: ${order.status}`,
        };
      }
      
      // Create OrderFiller instance for this request
      const orderFiller = new APIOrderFiller();
      
      // Attempt to fill the order using fillOrderArgs
      const fillResult = await orderFiller.fillOrderArgs(order);
      
      if (fillResult.success) {
        return {
          success: true,
          message: 'Order filled successfully using fillOrderArgs',
          txHash: fillResult.txHash,
        };
      } else {
        return {
          success: false,
          error: fillResult.error || 'Failed to fill order with fillOrderArgs',
        };
      }
      
    } catch (error) {
      console.error('Error filling order with fillOrderArgs:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  })
  .post('/order/:orderHash/cancel', async ({ params }) => {
    try {
      const { orderHash } = params;
      
      // Get order from database
      const order = await getOrderByHash(orderHash);
      
      if (!order) {
        return {
          success: false,
          error: 'Order not found',
        };
      }
      
      if (order.status !== 'pending') {
        return {
          success: false,
          error: `Cannot cancel order. Current status: ${order.status}`,
        };
      }
      
      // Update order status to cancelled
      await updateOrderStatus(order.id, 'cancelled');
      
      return {
        success: true,
        message: 'Order cancelled successfully',
      };
      
    } catch (error) {
      console.error('Error cancelling order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  })
  .post('/refresh-orders', async () => {
    try {
      const result = await refreshExpiredOrders();
      
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      console.error('Error refreshing orders:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  })
  .listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
