import { app } from './app';
import { connectDB } from './config/db';
import { config } from './config';
import { logger } from './config/logger';
import mongoose from 'mongoose';

async function start() {
  await connectDB();

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'Customer service started');
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, starting graceful shutdown');

    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        await mongoose.disconnect();
        logger.info('Database connection closed');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    });
  });
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start customer service');
  process.exit(1);
});
