import { app } from './app';
import { connectDB } from './config/db';
import { connectPublisher, disconnectPublisher } from './queue/publisher';
import { config } from './config';
import { logger } from './config/logger';
import { valkey } from './config/valkey';
import mongoose from 'mongoose';

let server: any = null;

export async function startServer(port?: number): Promise<void> {
  const serverPort = port || config.PORT;

  server = app.listen(serverPort, () => {
    logger.info({ port: serverPort }, 'Payment service started');
  });
}

export async function stopServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => server.close(resolve));
    logger.info('HTTP server closed');
  }

  await disconnectPublisher();
  logger.info('RabbitMQ publisher disconnected');

  await mongoose.disconnect();
  logger.info('Database connection closed');

  await valkey.quit();
  logger.info('Valkey connection closed');
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');

  try {
    await stopServer();
    logger.info('Payment service stopped gracefully');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
});

async function start() {
  await connectDB();
  await connectPublisher();
  await startServer();
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start payment service');
  process.exit(1);
});
