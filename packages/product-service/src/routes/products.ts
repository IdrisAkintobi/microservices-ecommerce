import { Router } from 'express';
import { z } from 'zod';
import { Product } from '../models/Product';
import { logger } from '../config/logger';
import { valkey } from '../config/valkey';

export const productsRouter = Router();

const RESERVATION_TTL = 3600; // 1 hour

const reserveStockSchema = z.object({
  quantity: z.number().int().positive(),
});

// GET /products — list all products
productsRouter.get('/', async (_req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch products');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /products/:id
productsRouter.get('/:id', async (req, res): Promise<void> => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json(product);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch product');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /products/:id/reserve — reserve stock in Valkey
productsRouter.post('/:id/reserve', async (req, res): Promise<void> => {
  try {
    const parsed = reserveStockSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { quantity } = parsed.data;
    const productId = req.params.id;

    // Get product from MongoDB
    const product = await Product.findById(productId);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Get current reservations from Valkey
    const reservationKey = `reservation:${productId}`;
    const reserved = await valkey.get(reservationKey);
    const totalReserved = reserved ? parseInt(reserved, 10) : 0;

    // Calculate available stock
    const availableStock = product.stock - totalReserved;

    if (availableStock < quantity) {
      logger.warn({ productId, quantity, availableStock, totalReserved }, 'Insufficient stock for reservation');
      res.status(409).json({ 
        error: 'Insufficient stock',
        available: availableStock,
        requested: quantity,
      });
      return;
    }

    // Atomically increment reservation count
    await valkey.incrby(reservationKey, quantity);

    // Set/refresh TTL to 1 hour
    await valkey.expire(reservationKey, RESERVATION_TTL);

    logger.info({ productId, quantity }, 'Stock reserved');
    res.json({ price: product.price });
  } catch (err) {
    logger.error({ err }, 'Failed to reserve stock');
    res.status(500).json({ error: 'Internal server error' });
  }
});


