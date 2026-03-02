import { Router } from 'express';
import { processPayment } from '../services/payment';
import { logger } from '../config/logger';
import { valkey } from '../config/valkey';
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
