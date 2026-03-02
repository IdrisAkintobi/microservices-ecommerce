import Redis from 'ioredis';
import { config } from './index';
import { logger } from './logger';

const MAX_RETRIES = 10;

export const valkey = new Redis(config.VALKEY_URL, {
  maxRetriesPerRequest: MAX_RETRIES,
  retryStrategy(times) {
    if (times > MAX_RETRIES) {
      logger.error('ValKey max retries exceeded');
      return null;
    }
    const delay = Math.min(times * 1000, 3000);
    return delay;
  },
});

valkey.on('connect', () => {
  logger.info('ValKey connected');
});

valkey.on('error', (err) => {
  logger.error({ err }, 'ValKey error');
});
