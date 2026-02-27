import amqp from 'amqplib';
import { config } from '../config';
import { logger } from '../config/logger';
import type { PaymentSucceededEvent, PaymentFailedEvent } from '@microservice/shared';

const EXCHANGE = 'microservice';
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 3_000;

let connection: Awaited<ReturnType<typeof amqp.connect>> | null = null;
let channel: Awaited<ReturnType<Awaited<ReturnType<typeof amqp.connect>>['createChannel']>> | null = null;

export async function connectPublisher(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const conn = await amqp.connect(config.RABBITMQ_URL);
      const ch = await conn.createChannel();
      
      await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
      
      connection = conn;
      channel = ch;
      
      logger.info('Payment service publisher connected');
      return;
    } catch (err) {
      logger.warn({ attempt, err }, 'RabbitMQ publisher connection failed, retrying...');
      if (attempt === MAX_RETRIES) throw err;
      await new Promise<void>(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

export async function publishPaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }

  const message = Buffer.from(JSON.stringify(event));
  
  channel.publish(EXCHANGE, 'payment.succeeded', message, {
    persistent: true,
    contentType: 'application/json',
  });

  logger.info({ orderId: event.orderId }, 'Published payment.succeeded event');
}

export async function publishPaymentFailed(event: PaymentFailedEvent): Promise<void> {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }

  const message = Buffer.from(JSON.stringify(event));
  
  channel.publish(EXCHANGE, 'payment.failed', message, {
    persistent: true,
    contentType: 'application/json',
  });

  logger.info({ orderId: event.orderId }, 'Published payment.failed event');
}

export async function disconnectPublisher(): Promise<void> {
  await channel?.close();
  await connection?.close();
  logger.info('Payment service publisher disconnected');
}
