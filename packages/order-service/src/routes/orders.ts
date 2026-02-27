import { Router } from 'express';
import { z } from 'zod';
import { Order } from '../models/Order';
import { logger } from '../config/logger';
import { checkIdempotency, setIdempotency } from '../services/idempotency';
import { validateCustomer, validateProduct } from '../services/validation';
import { generatePaymentLink } from '../services/paymentLink';
import type { OrderResponse } from '@microservice/shared';

export const ordersRouter = Router();

const createOrderSchema = z.object({
  customerId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
});

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
        logger.info({ orderId: existingOrderId }, 'Returning cached order (idempotent)');
        
        const paymentLink = await generatePaymentLink(
          existingOrder._id.toString(),
          existingOrder.amount
        );
        
        res.json({
          orderId: existingOrder._id.toString(),
          customerId: existingOrder.customerId,
          productId: existingOrder.productId,
          quantity: existingOrder.quantity,
          amount: existingOrder.amount,
          status: existingOrder.status,
          paymentLink,
          createdAt: existingOrder.createdAt.toISOString(),
        });
        return;
      }
    }

    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { customerId, productId, quantity } = parsed.data;

    // Validate customer and product exist
    const [customerValid, product] = await Promise.all([
      validateCustomer(customerId),
      validateProduct(productId),
    ]);

    if (!customerValid) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Calculate amount from product price
    const amount = product.price * quantity;

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

    // Generate payment link with JWT
    const paymentLink = await generatePaymentLink(order._id.toString(), amount);

    logger.info({ orderId: order._id, amount, paymentLink }, 'Order created with payment link');

    const response: OrderResponse = {
      orderId: order._id.toString(),
      customerId,
      productId,
      quantity,
      amount,
      status: order.status,
      paymentLink,
      createdAt: order.createdAt.toISOString(),
    };

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

    const paymentLink = await generatePaymentLink(order._id.toString(), order.amount);

    const response: OrderResponse = {
      orderId: order._id.toString(),
      customerId: order.customerId,
      productId: order.productId,
      quantity: order.quantity,
      amount: order.amount,
      status: order.status,
      paymentLink,
      createdAt: order.createdAt.toISOString(),
    };

    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch order');
    res.status(500).json({ error: 'Internal server error' });
  }
});
