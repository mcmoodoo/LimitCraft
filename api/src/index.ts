import {
  Address,
  Api,
  Extension,
  LimitOrder,
  MakerTraits,
  randBigInt,
  Sdk,
} from '@1inch/limit-order-sdk';
import { cors } from '@elysiajs/cors';
import axios from 'axios';
import { Elysia } from 'elysia';
import { JsonRpcProvider, Wallet } from 'ethers';
import {
  createOrder,
  getAllOrders,
  getOrderByHash,
  updateOrderStatus,
} from '../../db/src/index.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, lt } from 'drizzle-orm';
import postgres from 'postgres';
import { orders } from '../../db/src/schema.js';

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
      message:
        expiredCount > 0
          ? `Successfully marked ${expiredCount} orders as expired`
          : 'No expired orders found',
    };
  } catch (error) {
    console.error('❌ Error refreshing expired orders:', error);
    throw new Error(
      `Failed to refresh orders: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

const app = new Elysia()
  .use(
    cors({
      origin: true, // Allow all origins during development
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials: true,
    })
  )
  .get('/', () => 'Orderly backend running')
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
  .post('/submit-signed-order', async ({ body }: { body: SignedOrderRequest }) => {
    try {
      // Calculate expiration
      const expirationTimestamp = new MakerTraits(BigInt(body.makerTraits)).expiration();
      const expiresIn = new Date(Number(expirationTimestamp) * 1000);

      // Save to database
      const savedOrder = await createOrder({
        orderHash: body.orderHash,
        salt: body.typedData.message.salt,
        makerAsset: body.typedData.message.makerAsset,
        takerAsset: body.typedData.message.takerAsset,
        makingAmount: body.typedData.message.makingAmount,
        takingAmount: body.typedData.message.takingAmount,
        makerAddress: body.typedData.message.maker,
        expiresIn: expiresIn,
        signature: body.signature,
        makerTraits: new MakerTraits(BigInt(body.makerTraits)).asBigInt().toString(),
        extension: body.extension || '0x',
      });

      return {
        success: true,
        message: 'Signed order saved successfully',
        data: {
          orderHash: body.orderHash,
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
  .get('/prices', async ({ query }) => {
    try {
      // Mock prices - static values for now
      const mockPrices: Record<string, number> = {
        // USDC
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 1.0,
        // WETH
        '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 3200.5,
        // USDT
        '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 0.999,
        // USDC.e
        '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': 0.998,
      };

      // If specific tokens are requested via query params
      const tokens = query.tokens?.split(',') || [];

      if (tokens.length > 0) {
        const requestedPrices: Record<string, number> = {};
        tokens.forEach((token) => {
          const address = token.toLowerCase();
          requestedPrices[address] = mockPrices[address] || 0;
        });

        return {
          success: true,
          prices: requestedPrices,
          source: 'mock',
          timestamp: new Date().toISOString(),
        };
      }

      // Return all prices if no specific tokens requested
      return {
        success: true,
        prices: mockPrices,
        source: 'mock',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error fetching prices:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  })
  .listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
