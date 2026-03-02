import { Server } from 'node:http';
import { app } from './app';
import { connectDB } from './config/db';
import { connectConsumer, disconnectConsumer } from './queue/consumer';
import { config } from './config';
import { logger } from './config/logger';
import { valkey } from './config/valkey';
import mongoose from 'mongoose';

let server: Server | null = null;

export async function startServer(port?: number): Promise<void> {
  const serverPort = port || config.PORT;

  server = app.listen(serverPort, () => {
    logger.info({ port: serverPort }, 'Order service started');
  });
}

export async function stopServer(): Promise<void> {
  if (server) {
    server.close();
    logger.info('HTTP server closed');
  }

  await disconnectConsumer();
  logger.info('RabbitMQ consumer disconnected');

  await mongoose.disconnect();
  logger.info('Database connection closed');

  await valkey.quit();
  logger.info('Valkey connection closed');
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');

  try {
    await stopServer();
    logger.info('Order service stopped gracefully');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
});

async function start() {
  await connectDB();
  await connectConsumer();
  await startServer();
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start order service');
  process.exit(1);
});
