import express from 'express';
import { connectDB } from './config/db';
import { connectConsumer, disconnectConsumer } from './queue/consumer';
import { config } from './config';
import { logger } from './config/logger';
import { productsRouter } from './routes/products';
import { authenticateService } from './middleware/auth';

const app = express();

app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Auth middleware
app.use(authenticateService);

// Route handlers
app.use('/products', productsRouter);

async function start() {
  await connectDB();
  await connectConsumer();
  
  app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'Product service started');
  });
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await disconnectConsumer();
  process.exit(0);
});

start().catch((err) => {
  logger.error({ err }, 'Failed to start product service');
  process.exit(1);
});
