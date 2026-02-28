import { randomUUID } from 'crypto';
import { Transaction } from '../models/Transaction';
import { publishPaymentSucceeded, publishPaymentFailed } from '../queue/publisher';
import { logger } from '../config/logger';

interface PaymentResult {
  transactionId: string;
  status: 'success' | 'failed';
  error?: string;
}

// Simulate payment processing (defaults to success)
function simulatePayment(simulate?: 'success' | 'failure'): 'success' | 'failed' {
  if (simulate === 'failure') return 'failed';
  return 'success';
}

export async function processPayment(
  orderId: string,
  productId: string,
  quantity: number,
  amount: number,
  simulate?: 'success' | 'failure'
): Promise<PaymentResult> {
  logger.info({ orderId, productId, quantity, amount }, 'Processing payment');

  // Simulate payment gateway delay (1-3 seconds)
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

  // Process payment
  const status = simulatePayment(simulate);
  const transactionId = randomUUID();

  // Create transaction record (audit trail)
  const transaction = new Transaction({
    transactionId,
    orderId,
    amount,
    status,
    error: status === 'failed' ? 'Payment declined by gateway' : undefined,
  });

  await transaction.save();
  logger.info({ transactionId, orderId, status }, 'Transaction saved');

  // Publish event based on payment status
  await publishPaymentEvent(orderId, productId, quantity, amount, transactionId, status);

  return {
    transactionId,
    status,
    error: status === 'failed' ? 'Payment declined by gateway' : undefined,
  };
}

async function publishPaymentEvent(
  orderId: string,
  productId: string,
  quantity: number,
  amount: number,
  transactionId: string,
  status: 'success' | 'failed'
): Promise<void> {
  switch (status) {
    case 'success':
      await publishPaymentSucceeded({
        orderId,
        productId,
        quantity,
        amount,
        transactionId,
        timestamp: new Date().toISOString(),
      });
      logger.info({ orderId, transactionId }, 'Payment succeeded');
      break;

    case 'failed':
      await publishPaymentFailed({
        orderId,
        productId,
        quantity,
        amount,
        error: 'Payment declined by gateway',
        timestamp: new Date().toISOString(),
      });
      logger.info({ orderId }, 'Payment failed');
      break;
  }
}
