import mongoose from 'mongoose';
import { config } from './index';
import { logger } from './logger';

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 3_000;

export async function connectDB(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(config.MONGODB_URI);
      logger.info({ uri: config.MONGODB_URI }, 'MongoDB connected');
      return;
    } catch (err) {
      logger.warn({ attempt, err }, 'MongoDB connection failed, retrying...');
      if (attempt === MAX_RETRIES) throw err;
      await new Promise<void>(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}
