import { valkey } from '../config/valkey';
import { logger } from '../config/logger';

const IDEMPOTENCY_TTL = 86400; // 24 hours in seconds

export async function checkIdempotency(key: string): Promise<string | null> {
  try {
    const existing = await valkey.get(`idempotency:${key}`);
    return existing;
  } catch (err) {
    logger.error({ err, key }, 'Failed to check idempotency');
    throw err;
  }
}

export async function setIdempotency(key: string, orderId: string): Promise<void> {
  try {
    await valkey.setex(`idempotency:${key}`, IDEMPOTENCY_TTL, orderId);
  } catch (err) {
    logger.error({ err, key }, 'Failed to set idempotency');
    throw err;
  }
}
