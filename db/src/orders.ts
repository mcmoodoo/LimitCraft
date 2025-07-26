import { desc, eq } from 'drizzle-orm';
import { db } from './connection.js';
import { type NewOrder, type Order, orders } from './schema.js';

export async function createOrder(orderData: NewOrder): Promise<Order> {
  const [newOrder] = await db.insert(orders).values(orderData).returning();
  return newOrder;
}

export async function getOrderById(id: string): Promise<Order | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  return order || null;
}

export async function getOrderByHash(orderHash: string): Promise<Order | null> {
  const [order] = await db.select().from(orders).where(eq(orders.orderHash, orderHash));
  return order || null;
}

export async function getAllOrders(limit = 100, offset = 0): Promise<Order[]> {
  return await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(limit).offset(offset);
}

export async function getOrdersByStatus(
  status: 'pending' | 'filled' | 'cancelled' | 'expired'
): Promise<Order[]> {
  return await db
    .select()
    .from(orders)
    .where(eq(orders.status, status))
    .orderBy(desc(orders.createdAt));
}

export async function updateOrderStatus(
  id: string,
  status: 'pending' | 'filled' | 'cancelled' | 'expired'
): Promise<Order | null> {
  const [updatedOrder] = await db
    .update(orders)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, id))
    .returning();

  return updatedOrder || null;
}
