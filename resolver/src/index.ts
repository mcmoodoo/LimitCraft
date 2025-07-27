#!/usr/bin/env node

import { config } from './config.js';
import { orderFiller } from './filler.js';
import { orderMonitor } from './monitor.js';
import { priceChecker } from './pricer.js';
import { walletManager } from './wallet.js';

class OrderResolver {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;

  async start() {
    if (this.isRunning) {
      console.log('⚠️ Resolver is already running');
      return;
    }

    console.log('🚀 Starting Order Resolver...');
    console.log(`📊 Poll interval: ${config.resolver.pollIntervalMs}ms`);
    console.log(`💰 Min profit: ${config.resolver.minProfitWei} wei`);
    console.log(`⛽ Max gas price: ${config.resolver.maxGasPrice} wei`);

    // Check wallet setup
    const balance = await walletManager.getBalance();
    console.log(`👛 Wallet balance: ${(Number(balance) / 1e18).toFixed(4)} ETH`);

    if (balance < BigInt('10000000000000000')) {
      // 0.01 ETH
      console.warn('⚠️ Low wallet balance - may not be able to fill orders');
    }

    this.isRunning = true;

    // Start polling
    this.intervalId = setInterval(() => {
      this.processOrders().catch((error) => {
        console.error('❌ Error in polling cycle:', error);
      });
    }, config.resolver.pollIntervalMs);

    // Run first cycle immediately
    await this.processOrders();

    console.log('✅ Order Resolver started successfully');
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping Order Resolver...');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
    console.log('✅ Order Resolver stopped');
  }

  private async processOrders() {
    try {
      console.log('🔍 Checking for orders to fill...');

      // 1. Mark expired orders
      const expiredCount = await orderMonitor.markExpiredOrders();
      if (expiredCount > 0) {
        console.log(`⏰ Marked ${expiredCount} orders as expired`);
      }

      // 2. Get pending orders
      const pendingOrders = await orderMonitor.getPendingOrders();

      if (pendingOrders.length === 0) {
        console.log('📭 No pending orders found');
        return;
      }

      // 3. Check each order for profitability and fill if profitable
      for (const order of pendingOrders) {
        await this.processOrder(order);
      }
    } catch (error) {
      console.error('❌ Error processing orders:', error);
    }
  }

  private async processOrder(order: any) {
    try {
      console.log(`🔍 Analyzing order ${order.orderHash}`);

      // Check profitability
      const profitability = await priceChecker.calculateProfitability(order);

      if (!profitability.isProfitable) {
        console.log(`💸 Order ${order.orderHash} not profitable: ${profitability.reason}`);
        return;
      }

      console.log(
        `💰 Order ${order.orderHash} is profitable! Estimated profit: ${(Number(profitability.estimatedProfitWei) / 1e18).toFixed(4)} ETH`
      );

      // Attempt to fill the order
      const fillResult = await orderFiller.fillOrder(order);

      if (fillResult.success) {
        console.log(`🎉 Successfully filled order ${order.orderHash}! TX: ${fillResult.txHash}`);
      } else {
        console.error(`❌ Failed to fill order ${order.orderHash}: ${fillResult.error}`);
      }
    } catch (error) {
      console.error(`❌ Error processing order ${order.orderHash}:`, error);
    }
  }
}

// Handle graceful shutdown
const resolver = new OrderResolver();

process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await resolver.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await resolver.stop();
  process.exit(0);
});

// Start the resolver
resolver.start().catch((error) => {
  console.error('❌ Failed to start resolver:', error);
  process.exit(1);
});
