import { app } from './app';
import { connectDB } from './config/db';
import { config } from './config';
import { logger } from './config/logger';

async function start() {
  await connectDB();

  app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'Customer service started');
  });
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start customer service');
  process.exit(1);
});
