import express from 'express';
import { paymentsRouter } from './routes/payments';
import { authenticateService } from './middleware/auth';

export const app = express();

app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Auth middleware
app.use(authenticateService);

// Route handlers
app.use('/payments', paymentsRouter);
