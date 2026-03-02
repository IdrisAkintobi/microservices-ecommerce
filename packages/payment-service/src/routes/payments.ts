import { Router } from 'express';
import { processPayment } from '../services/payment';
import { logger } from '../config/logger';
import { valkey } from '../config/valkey';
import { Transaction } from '../models/Transaction';
import type { PaymentResponse } from '@microservice/shared';

export const paymentsRouter = Router();

// POST /payments?token={sessionId}&simulate=success|failure
paymentsRouter.post('/', async (req, res): Promise<void> => {
  try {
    const sessionId = req.query.token as string;
    const simulate = req.query.simulate as 'success' | 'failure' | undefined;

    if (!sessionId) {
      res.status(400).json({ error: 'token query parameter is required' });
      return;
    }

    // Get payment session from Valkey
    const sessionKey = `payment:session:${sessionId}`;
    const sessionData = await valkey.get(sessionKey);

    if (!sessionData) {
      res.status(409).json({ error: 'Payment session expired or already processed' });
      return;
    }

    const session: { orderId: string; productId: string; quantity: number; amount: number } =
      JSON.parse(sessionData);
    const { orderId, productId, quantity, amount } = session;

    // Delete session to prevent duplicate payments (consume once)
    await valkey.del(sessionKey);

    logger.info({ orderId, productId, quantity, amount, simulate }, 'Processing payment');

    const result = await processPayment(orderId, productId, quantity, amount, simulate);

    if (result.status === 'success') {
      const response: PaymentResponse = {
        transactionId: result.transactionId,
        orderId,
        amount,
        status: 'success',
      };

      res.json(response);
    } else {
      const response: PaymentResponse = {
        transactionId: result.transactionId,
        orderId,
        amount,
        status: 'failed',
        error: result.error,
      };

      res.status(402).json(response);
    }
  } catch (err: unknown) {
    logger.error({ err }, 'Failed to process payment');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /payments/transactions — list transactions with pagination and filters
paymentsRouter.get('/transactions', async (req, res): Promise<void> => {
  try {
    const {
      orderId,
      status,
      limit = '20',
      page = '1',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // Build filter
    const filter: Record<string, unknown> = {};
    if (orderId) {
      filter.orderId = orderId;
    }
    if (status) {
      filter.status = status;
    }

    // Parse pagination
    const limitNum = Math.min(Math.max(parseInt(limit as string, 10), 1), 100);
    const pageNum = Math.max(parseInt(page as string, 10), 1);
    const skip = (pageNum - 1) * limitNum;

    // Build sort
    const sort: Record<string, 1 | -1> = {};
    sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

    // Query with pagination
    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort(sort).skip(skip).limit(limitNum),
      Transaction.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    const response = {
      data: transactions.map((t) => ({
        transactionId: t.transactionId,
        orderId: t.orderId,
        amount: t.amount,
        status: t.status,
        error: t.error,
        createdAt: t.createdAt.toISOString(),
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasMore: pageNum < totalPages,
      },
    };

    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Failed to list transactions');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /payments/transactions/:id — get transaction by ID
paymentsRouter.get('/transactions/:id', async (req, res): Promise<void> => {
  try {
    const transactionId = req.params.id;

    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    const response = {
      transactionId: transaction.transactionId,
      orderId: transaction.orderId,
      amount: transaction.amount,
      status: transaction.status,
      error: transaction.error,
      createdAt: transaction.createdAt.toISOString(),
    };

    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch transaction');
    res.status(500).json({ error: 'Internal server error' });
  }
});
