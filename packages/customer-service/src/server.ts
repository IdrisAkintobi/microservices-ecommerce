import express from 'express';
import { connectDB } from './config/db';
import { config } from './config';
import { logger } from './config/logger';
import { customersRouter } from './routes/customers';
import { authenticateService } from './middleware/auth';

const app = express();

app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Auth middleware
app.use(authenticateService);

// Route handlers
app.use('/customers', customersRouter);

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
