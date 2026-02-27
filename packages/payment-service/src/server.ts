import express from 'express';
import { connectDB } from './config/db';
import { connectPublisher, disconnectPublisher } from './queue/publisher';
import { config } from './config';
import { logger } from './config/logger';
import { paymentsRouter } from './routes/payments';

const app = express();

app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Route handlers
app.use('/payments', paymentsRouter);

async function start() {
  await connectDB();
  await connectPublisher();
  
  app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'Payment service started');
  });
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await disconnectPublisher();
  process.exit(0);
});

start().catch((err) => {
  logger.error({ err }, 'Failed to start payment service');
  process.exit(1);
});
