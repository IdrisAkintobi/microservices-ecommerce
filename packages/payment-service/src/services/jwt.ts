import { jwtVerify } from 'jose';
import { config } from '../config';
import { logger } from '../config/logger';

interface PaymentTokenPayload {
  orderId: string;
  productId: string;
  quantity: number;
  amount: number;
}

const JWT_ALGORITHM = 'HS256';
const secret = new TextEncoder().encode(config.JWT_SECRET);

export async function verifyPaymentToken(token: string): Promise<PaymentTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [JWT_ALGORITHM],
    });

    return {
      orderId: payload.orderId as string,
      productId: payload.productId as string,
      quantity: payload.quantity as number,
      amount: payload.amount as number,
    };
  } catch (err) {
    logger.warn({ err }, 'JWT verification failed');
    return null;
  }
}
