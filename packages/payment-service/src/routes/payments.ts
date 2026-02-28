import { Router } from 'express';
import { verifyPaymentToken } from '../services/jwt';
import { processPayment } from '../services/payment';
import { logger } from '../config/logger';
import type { PaymentResponse } from '@microservice/shared';

export const paymentsRouter = Router();

// POST /payments?token={jwt}&simulate=success|failure
paymentsRouter.post('/', async (req, res): Promise<void> => {
  try {
    const token = req.query.token as string;
    const simulate = req.query.simulate as 'success' | 'failure' | undefined;
    
    if (!token) {
      res.status(400).json({ error: 'token query parameter is required' });
      return;
    }

    // Verify JWT and extract payload
    const payload = await verifyPaymentToken(token);
    
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const { orderId, productId, quantity, amount } = payload;

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
  } catch (err: any) {
    logger.error({ err }, 'Failed to process payment');
    res.status(500).json({ error: 'Internal server error' });
  }
});
