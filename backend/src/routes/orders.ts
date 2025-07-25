import express, { Request, Response } from 'express';
import { query } from '../database.js';
import { generateOrderHash, verifyEIP712Signature } from '../utils/crypto.js';
import type { 
  OrdersQueryParams, 
  OrdersResponse, 
  OrderWithSignature, 
  DatabaseOrder,
  ApiError 
} from '../types/index.js';

const router = express.Router();

// GET /orders - Retrieve all orders with optional filtering
router.get('/orders', async (req: Request<{}, OrdersResponse | ApiError, {}, OrdersQueryParams>, res: Response<OrdersResponse | ApiError>) => {
  try {
    const { status, maker, limit = '50', offset = '0' } = req.query;
    
    let queryText = `
      SELECT order_hash, maker_asset, taker_asset, making_amount, taking_amount,
             maker_address, expires_in, signature, maker_traits, extension,
             status, created_at, updated_at
      FROM orders
    `;
    
    const conditions = [];
    const params = [];
    let paramIndex = 1;
    
    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    
    if (maker) {
      conditions.push(`maker_address = $${paramIndex++}`);
      params.push(maker.toLowerCase());
    }
    
    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }
    
    queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await query(queryText, params);
    
    res.json({
      orders: result.rows as DatabaseOrder[],
      total: result.rowCount || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /order/:orderHash - Get individual order by hash
router.get('/order/:orderHash', async (req: Request<{ orderHash: string }>, res: Response<DatabaseOrder | ApiError>): Promise<void> => {
  try {
    const { orderHash } = req.params;
    
    if (!orderHash || orderHash.length !== 66 || !orderHash.startsWith('0x')) {
      return res.status(400).json({ error: 'Invalid order hash format' });
    }
    
    const result = await query(
      `SELECT order_hash, maker_asset, taker_asset, making_amount, taking_amount,
              maker_address, expires_in, signature, maker_traits, extension,
              status, created_at, updated_at
       FROM orders 
       WHERE order_hash = $1`,
      [orderHash]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(result.rows[0] as DatabaseOrder);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /limit-order - Create a new limit order
router.post('/limit-order', async (req: Request<{}, DatabaseOrder | ApiError, OrderWithSignature>, res: Response<DatabaseOrder | ApiError>): Promise<void> => {
  try {
    const {
      makerAsset,
      takerAsset,
      makingAmount,
      takingAmount,
      makerAddress,
      expiresIn,
      signature,
      makerTraits = {},
      extension = {}
    } = req.body;
    
    // Validate required fields
    if (!makerAsset || !takerAsset || !makingAmount || !takingAmount || !makerAddress || !expiresIn || !signature) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate address formats
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(makerAsset) || !addressRegex.test(takerAsset) || !addressRegex.test(makerAddress)) {
      return res.status(400).json({ error: 'Invalid address format' });
    }
    
    // Validate amounts are positive
    if (BigInt(makingAmount) <= 0 || BigInt(takingAmount) <= 0) {
      return res.status(400).json({ error: 'Amounts must be positive' });
    }
    
    // Validate expiration is in the future
    const expirationDate = new Date(expiresIn);
    if (expirationDate <= new Date()) {
      return res.status(400).json({ error: 'Expiration must be in the future' });
    }
    
    const orderData = {
      makerAsset,
      takerAsset,
      makingAmount,
      takingAmount,
      makerAddress,
      expiresIn,
      makerTraits,
      extension
    };
    
    // Verify EIP712 signature
    const isValidSignature = await verifyEIP712Signature(orderData, signature);
    if (!isValidSignature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    
    // Generate order hash
    const orderHash = generateOrderHash(orderData);
    
    // Check if order already exists
    const existingOrder = await query('SELECT order_hash FROM orders WHERE order_hash = $1', [orderHash]);
    if (existingOrder.rows.length > 0) {
      return res.status(409).json({ error: 'Order already exists' });
    }
    
    // Insert order into database
    const result = await query(
      `INSERT INTO orders (
        order_hash, maker_asset, taker_asset, making_amount, taking_amount,
        maker_address, expires_in, signature, maker_traits, extension
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        orderHash,
        makerAsset.toLowerCase(),
        takerAsset.toLowerCase(),
        makingAmount,
        takingAmount,
        makerAddress.toLowerCase(),
        expirationDate,
        Buffer.from(signature.slice(2), 'hex'),
        JSON.stringify(makerTraits),
        JSON.stringify(extension)
      ]
    );
    
    res.status(201).json(result.rows[0] as DatabaseOrder);
  } catch (error: any) {
    console.error('Error creating order:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(409).json({ error: 'Order already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;