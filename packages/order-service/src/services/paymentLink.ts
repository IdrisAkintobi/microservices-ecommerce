import { randomUUID } from 'crypto';
import { valkey } from '../config/valkey';

const PAYMENT_SESSION_TTL = 3600; // 1 hour in seconds

interface PaymentSession {
  orderId: string;
  productId: string;
  quantity: number;
  amount: number;
  createdAt: string;
}

export async function generatePaymentToken(
  orderId: string,
  productId: string,
  quantity: number,
  amount: number
): Promise<string> {
  const sessionId = randomUUID();

  // Store payment session in Valkey
  const session: PaymentSession = {
    orderId,
    productId,
    quantity,
    amount,
    createdAt: new Date().toISOString(),
  };

  const sessionKey = `payment:session:${sessionId}`;
  await valkey.setex(sessionKey, PAYMENT_SESSION_TTL, JSON.stringify(session));

  return sessionId;
}
