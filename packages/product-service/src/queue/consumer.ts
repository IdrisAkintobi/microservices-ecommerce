import amqp from 'amqplib';
import { config } from '../config';
import { logger } from '../config/logger';
import { Product } from '../models/Product';
import { valkey } from '../config/valkey';
import type { PaymentSucceededEvent, PaymentFailedEvent } from '@microservice/shared';

const EXCHANGE = 'microservice';
const SUCCESS_QUEUE = 'product.payment.succeeded';
const FAILED_QUEUE = 'product.payment.failed';
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
      
      logger.info('Product service consumer connected');
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

    // Extract productId and quantity from event
    const { productId, quantity } = event as any;

    if (!productId || !quantity) {
      logger.error({ orderId: event.orderId }, 'Missing productId or quantity in payment event');
      channel.ack(msg);
      return;
    }

    // Decrement MongoDB stock atomically
    const product = await Product.findOneAndUpdate(
      {
        _id: productId,
        stock: { $gte: quantity },
      },
      {
        $inc: { stock: -quantity },
      },
      {
        new: true,
      }
    );

    if (!product) {
      logger.error({ orderId: event.orderId, productId, quantity }, 'Failed to decrement stock - insufficient stock or product not found');
      channel.ack(msg);
      return;
    }

    logger.info({ orderId: event.orderId, productId, quantity, newStock: product.stock }, 'Stock decremented in MongoDB');
    
    // Decrement Valkey reservation
    const reservationKey = `reservation:${productId}`;
    const exists = await valkey.exists(reservationKey);
    
    if (exists) {
      const newValue = await valkey.decrby(reservationKey, quantity);
      
      if (newValue <= 0) {
        await valkey.del(reservationKey);
      }
      
      logger.info({ orderId: event.orderId, productId, quantity }, 'Reservation decremented');
    }
    
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

    // Extract productId and quantity from event
    const { productId, quantity } = event as any;

    if (!productId || !quantity) {
      logger.error({ orderId: event.orderId }, 'Missing productId or quantity in payment event');
      channel.ack(msg);
      return;
    }

    // Release reservation in Valkey (if not expired)
    const reservationKey = `reservation:${productId}`;
    const exists = await valkey.exists(reservationKey);
    
    if (exists) {
      const newValue = await valkey.decrby(reservationKey, quantity);
      
      if (newValue <= 0) {
        await valkey.del(reservationKey);
      }
      
      logger.info({ orderId: event.orderId, productId, quantity }, 'Reservation released');
    } else {
      logger.info({ orderId: event.orderId, productId, quantity }, 'Reservation already expired');
    }

    channel.ack(msg);
  } catch (err) {
    logger.error({ err }, 'Failed to process payment.failed event');
    channel.nack(msg, false, false);
  }
}

export async function disconnectConsumer(): Promise<void> {
  await channel?.close();
  await connection?.close();
  logger.info('Product service consumer disconnected');
}
