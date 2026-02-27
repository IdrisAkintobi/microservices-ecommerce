import { Router } from 'express';
import { Customer } from '../models/Customer';
import { logger } from '../config/logger';

export const customersRouter = Router();

// GET /customers — list all customers
customersRouter.get('/', async (_req, res) => {
  try {
    const customers = await Customer.find();
    res.json(customers);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch customers');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /customers/:id
customersRouter.get('/:id', async (req, res): Promise<void> => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    res.json(customer);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch customer');
    res.status(500).json({ error: 'Internal server error' });
  }
});
