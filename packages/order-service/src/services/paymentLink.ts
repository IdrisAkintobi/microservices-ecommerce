import { SignJWT } from 'jose';
import { config } from '../config';

const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRATION = '1h';
const secret = new TextEncoder().encode(config.JWT_SECRET);

export async function generatePaymentLink(
  orderId: string,
  productId: string,
  quantity: number,
  amount: number
): Promise<string> {
  const token = await new SignJWT({ orderId, productId, quantity, amount })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(secret);

  return `${config.PAYMENT_SERVICE_URL}/payments?token=${token}`;
}
