import { Router } from 'express';
import { Product } from '../models/Product';
import { logger } from '../config/logger';

export const productsRouter = Router();

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
