#!/usr/bin/env bun

import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { orders } from '../../db/src/schema';
import { config } from '../src/config';
import { orderFiller } from '../src/filler';

// Get order hash from command line
const orderHash = process.argv[2];

if (!orderHash) {
  console.error('❌ Usage: bun scripts/fill.ts <order-hash>');
  process.exit(1);
}

// Database connection
const connectionString = `postgresql://${config.db.user}:${config.db.password}@${config.db.host}:${config.db.port}/${config.db.database}`;
const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function fillOrder() {
  try {
    console.log(`🔍 Looking for order: ${orderHash}`);

    // Find the order in database
    const order = await db
      .select()
      .from(orders)
      .where(eq(orders.orderHash, orderHash))
      .limit(1);

    if (order.length === 0) {
      console.error(`❌ Order not found: ${orderHash}`);
      process.exit(1);
    }

    const orderData = order[0];
    console.log(`📋 Found order:`, {
      id: orderData.id,
      status: orderData.status,
      makerAsset: orderData.makerAsset,
      takerAsset: orderData.takerAsset,
      makingAmount: orderData.makingAmount,
      takingAmount: orderData.takingAmount,
    });

    if (orderData.status !== 'pending') {
      console.error(`❌ Order is not pending. Current status: ${orderData.status}`);
      process.exit(1);
    }

    // Attempt to fill the order
    console.log(`🔄 Attempting to fill order...`);
    const result = await orderFiller.fillOrder(orderData);

    if (result.success) {
      console.log(`🎉 Order filled successfully!`);
      console.log(`📤 Transaction hash: ${result.txHash}`);
    } else {
      console.error(`❌ Failed to fill order: ${result.error}`);
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

fillOrder();