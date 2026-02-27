import amqp from 'amqplib';
import { config } from '../config';
import { logger } from '../config/logger';
import { Order } from '../models/Order';
import type { PaymentSucceededEvent, PaymentFailedEvent } from '@microservice/shared';

const EXCHANGE = 'microservice';
const SUCCESS_QUEUE = 'order.payment.succeeded';
const FAILED_QUEUE = 'order.payment.failed';
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 3_000;

let connection: Awaited<ReturnType<typeof amqp.connect>> | null = null;
let channel: Awaited<ReturnType<Awaited<ReturnType<typeof amqp.connect>>['createChannel']>> | null = null;

export async function connectConsumer(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const conn = await amqp.connect(config.RABBITMQ_URL);
      const ch = await conn.createChannel();
      
      await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
      
      // Success queue
      await ch.assertQueue(SUCCESS_QUEUE, { durable: true });
      await ch.bindQueue(SUCCESS_QUEUE, EXCHANGE, 'payment.succeeded');
      
      // Failed queue
      await ch.assertQueue(FAILED_QUEUE, { durable: true });
      await ch.bindQueue(FAILED_QUEUE, EXCHANGE, 'payment.failed');
      
      await ch.prefetch(1);
      
      await ch.consume(SUCCESS_QUEUE, handleSuccessMessage, { noAck: false });
      await ch.consume(FAILED_QUEUE, handleFailedMessage, { noAck: false });
      
      connection = conn;
      channel = ch;
      
      logger.info('Order service consumer connected');
      return;
    } catch (err) {
      logger.warn({ attempt, err }, 'RabbitMQ consumer connection failed, retrying...');
      if (attempt === MAX_RETRIES) throw err;
      await new Promise<void>(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

async function handleSuccessMessage(msg: amqp.ConsumeMessage | null): Promise<void> {
  if (!msg || !channel) return;

  try {
    const event: PaymentSucceededEvent = JSON.parse(msg.content.toString());
    logger.info({ orderId: event.orderId }, 'Received payment.succeeded event');

    const order = await Order.findById(event.orderId);
    if (!order) {
      logger.error({ orderId: event.orderId }, 'Order not found for payment.succeeded');
      channel.ack(msg);
      return;
    }

    order.status = 'confirmed';
    await order.save();

    logger.info({ orderId: event.orderId }, 'Order confirmed');
    channel.ack(msg);
  } catch (err) {
    logger.error({ err }, 'Failed to process payment.succeeded event');
    channel.nack(msg, false, false);
  }
}

async function handleFailedMessage(msg: amqp.ConsumeMessage | null): Promise<void> {
  if (!msg || !channel) return;

  try {
    const event: PaymentFailedEvent = JSON.parse(msg.content.toString());
    logger.info({ orderId: event.orderId }, 'Received payment.failed event');

    const order = await Order.findById(event.orderId);
    if (!order) {
      logger.error({ orderId: event.orderId }, 'Order not found for payment.failed');
      channel.ack(msg);
      return;
    }

    order.status = 'failed';
    await order.save();

    logger.info({ orderId: event.orderId }, 'Order marked as failed');
    channel.ack(msg);
  } catch (err) {
    logger.error({ err }, 'Failed to process payment.failed event');
    channel.nack(msg, false, false);
  }
}

export async function disconnectConsumer(): Promise<void> {
  await channel?.close();
  await connection?.close();
  logger.info('Order service consumer disconnected');
}
