import { and, eq, gt, lt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Order } from '../../db/src/schema.js';

// Import schema from db package
import { orders } from '../../db/src/schema.js';
import { config } from './config.js';

const connectionString = `postgresql://${config.db.user}:${config.db.password}@${config.db.host}:${config.db.port}/${config.db.database}`;
const client = postgres(connectionString, { max: 5 });
const db = drizzle(client);

export class OrderMonitor {
  async getPendingOrders(): Promise<Order[]> {
    try {
      // Get orders that are:
      // 1. Status = 'pending'
      // 2. Not expired (expires_in > now)
      const currentTime = new Date();
      const pendingOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.status, 'pending'),
            // Use gt() instead of lt() and correct order: expires_in > current_time
            gt(orders.expiresIn, currentTime)
          )
        )
        .orderBy(orders.createdAt);

      console.log(`📊 Found ${pendingOrders.length} pending orders`);
      return pendingOrders;
    } catch (error) {
      console.error('❌ Error fetching pending orders:', error);
      return [];
    }
  }

  async updateOrderStatus(
    orderId: string,
    status: 'filled' | 'cancelled' | 'expired'
  ): Promise<void> {
    try {
      await db
        .update(orders)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      console.log(`✅ Updated order ${orderId} status to ${status}`);
    } catch (error) {
      console.error(`❌ Error updating order ${orderId}:`, error);
    }
  }

  async markExpiredOrders(): Promise<number> {
    try {
      const currentTime = new Date();
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

      if (result.length > 0) {
        console.log(`⏰ Marked ${result.length} orders as expired`);
      }

      return result.length;
    } catch (error) {
      console.error('❌ Error marking expired orders:', error);
      return 0;
    }
  }
}

export const orderMonitor = new OrderMonitor();
