import { Router } from 'express';
import { z } from 'zod';
import { Order } from '../models/Order';
import { logger } from '../config/logger';
import { checkIdempotency, setIdempotency } from '../services/idempotency';
import { validateCustomer, reserveStock } from '../services/validation';
import { generatePaymentLink } from '../services/paymentLink';
import type { OrderResponse } from '@microservice/shared';

export const ordersRouter = Router();

const createOrderSchema = z.object({
  customerId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
});

// Helper: Build order response with optional payment link
async function buildOrderResponse(order: any): Promise<OrderResponse> {
  const paymentLink = order.status === 'pending'
    ? await generatePaymentLink(order._id.toString(), order.productId, order.quantity, order.amount)
    : undefined;

  return {
    orderId: order._id.toString(),
    customerId: order.customerId,
    productId: order.productId,
    quantity: order.quantity,
    amount: order.amount,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    ...(paymentLink ? { paymentLink } : {}),
  };
}

// POST /orders — create order and return payment link
ordersRouter.post('/', async (req, res): Promise<void> => {
  try {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    
    if (!idempotencyKey) {
      res.status(400).json({ error: 'idempotency-key header is required' });
      return;
    }

    // Check idempotency
    const existingOrderId = await checkIdempotency(idempotencyKey);
    if (existingOrderId) {
      const existingOrder = await Order.findById(existingOrderId);
      if (existingOrder) {
        logger.info({ orderId: existingOrderId, status: existingOrder.status }, 'Returning cached order (idempotent)');
        const response = await buildOrderResponse(existingOrder);
        res.json(response);
        return;
      }
    }

    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { customerId, productId, quantity } = parsed.data;

    // Validate customer exists
    const customerValid = await validateCustomer(customerId);
    if (!customerValid) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    // Reserve stock and get product price
    const productData = await reserveStock(productId, quantity);
    if (!productData) {
      res.status(409).json({ error: 'Product not found or insufficient stock' });
      return;
    }

    // Calculate amount from product price
    const amount = productData.price * quantity;

    // Create order (status: pending, awaiting payment)
    const order = new Order({
      customerId,
      productId,
      quantity,
      amount,
      status: 'pending',
    });

    await order.save();

    // Store idempotency key
    await setIdempotency(idempotencyKey, order._id.toString());

    logger.info({ orderId: order._id, amount }, 'Order created');

    const response = await buildOrderResponse(order);
    res.status(201).json(response);
  } catch (err) {
    logger.error({ err }, 'Failed to create order');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /orders/:id — get order details
ordersRouter.get('/:id', async (req, res): Promise<void> => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const response = await buildOrderResponse(order);
    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch order');
    res.status(500).json({ error: 'Internal server error' });
  }
});
