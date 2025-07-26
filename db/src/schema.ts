import { pgTable, uuid, varchar, timestamp, text, pgEnum, numeric } from 'drizzle-orm/pg-core';

export const orderStatusEnum = pgEnum('order_status', ['pending', 'filled', 'cancelled', 'expired']);

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderHash: varchar('order_hash', { length: 66 }).notNull().unique(),
  makerAsset: varchar('maker_asset', { length: 42 }).notNull(),
  takerAsset: varchar('taker_asset', { length: 42 }).notNull(),
  makingAmount: numeric('making_amount').notNull(),
  takingAmount: numeric('taking_amount').notNull(),
  makerAddress: varchar('maker_address', { length: 42 }).notNull(),
  expiresIn: timestamp('expires_in').notNull(),
  signature: text('signature').notNull(),
  makerTraits: text('maker_traits').notNull(),
  extension: text('extension').notNull(),
  status: orderStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;