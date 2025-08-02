import { and, eq, gt, lt, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Order } from '../../db/src/schema';

// Import schema from db package
import { orders } from '../../db/src/schema';
import { config } from './config';

const connectionString = `postgresql://${config.db.user}:${config.db.password}@${config.db.host}:${config.db.port}/${config.db.database}`;
const client = postgres(connectionString, { max: 5 });
const db = drizzle(client);

export class OrderMonitor {
  async getPendingOrders(): Promise<Order[]> {
    try {
      // Get orders that are:
      // 1. Status = 'pending' or 'partialFilled'
      // 2. Not expired (expires_in > now)
      const currentTime = new Date();
      const pendingOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            or(
              eq(orders.status, 'pending'),
              eq(orders.status, 'partialFilled')
            ),
            // Use gt() instead of lt() and correct order: expires_in > current_time
            gt(orders.expiresIn, currentTime)
          )
        )
        .orderBy(orders.createdAt);

      return pendingOrders;
    } catch (error) {
      console.error('❌ Error fetching pending orders:', error);
      return [];
    }
  }

  async updateOrderStatus(
    orderId: string,
    status: 'filled' | 'cancelled' | 'expired' | 'partialFilled',
    fillTxTimestamp?: Date
  ): Promise<void> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      // If status is 'filled' or 'partialFilled' and we have a transaction timestamp, update last_fill_tx_at
      if ((status === 'filled' || status === 'partialFilled') && fillTxTimestamp) {
        updateData.lastFillTxAt = fillTxTimestamp;
      }

      await db
        .update(orders)
        .set(updateData)
        .where(eq(orders.id, orderId));

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
            or(
              eq(orders.status, 'pending'),
              eq(orders.status, 'partialFilled')
            ),
            lt(orders.expiresIn, currentTime) // Expiration time < current time
          )
        );


      return result.length;
    } catch (error) {
      console.error('❌ Error marking expired orders:', error);
      return 0;
    }
  }
}

export const orderMonitor = new OrderMonitor();
