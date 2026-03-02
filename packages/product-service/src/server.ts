import { app } from './app';
import { connectDB } from './config/db';
import { connectConsumer, disconnectConsumer } from './queue/consumer';
import { config } from './config';
import { logger } from './config/logger';

let server: any = null;

export async function startServer(port?: number): Promise<void> {
  const serverPort = port || config.PORT;

  server = app.listen(serverPort, () => {
    logger.info({ port: serverPort }, 'Product service started');
  });
}

export async function stopServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => server.close(resolve));
  }
  await disconnectConsumer();
  logger.info('Product service stopped');
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await stopServer();
  process.exit(0);
});

async function start() {
  await connectDB();
  await connectConsumer();
  await startServer();
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start product service');
  process.exit(1);
});
