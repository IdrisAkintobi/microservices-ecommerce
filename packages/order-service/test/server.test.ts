import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../src/app';
import { Order } from '../src/models/Order';

// Use Jest's automatic mocking
jest.mock('ioredis');
jest.mock('amqplib');

describe('Order Service - API Tests', () => {
  let mongoServer: MongoMemoryServer;
  const API_KEY = 'test-key';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body.status).toBe('ok');
    });
  });

  describe('Order Model', () => {
    it('should create order with required fields', async () => {
      await Order.deleteMany({});

      const order = await Order.create({
        customerId: new mongoose.Types.ObjectId().toString(),
        productId: new mongoose.Types.ObjectId().toString(),
        quantity: 5,
        amount: 2600000,
        status: 'pending',
      });

      expect(order._id).toBeDefined();
      expect(order.customerId).toBeDefined();
      expect(order.productId).toBeDefined();
      expect(order.quantity).toBe(5);
      expect(order.amount).toBe(2600000);
      expect(order.status).toBe('pending');
      expect(order.createdAt).toBeInstanceOf(Date);
    });

    it('should require customerId field', async () => {
      await expect(
        Order.create({
          productId: new mongoose.Types.ObjectId().toString(),
          quantity: 1,
          amount: 100000,
          status: 'pending',
        } as Partial<typeof Order.prototype>)
      ).rejects.toHaveProperty('errors.customerId');
    });

    it('should require productId field', async () => {
      await expect(
        Order.create({
          customerId: new mongoose.Types.ObjectId().toString(),
          quantity: 1,
          amount: 100000,
          status: 'pending',
        } as Partial<typeof Order.prototype>)
      ).rejects.toHaveProperty('errors.productId');
    });

    it('should validate status enum values', async () => {
      await expect(
        Order.create({
          customerId: new mongoose.Types.ObjectId().toString(),
          productId: new mongoose.Types.ObjectId().toString(),
          quantity: 1,
          amount: 100000,
          status: 'invalid-status' as 'pending' | 'confirmed' | 'failed',
        })
      ).rejects.toHaveProperty('errors.status');
    });

    it('should accept valid status values', async () => {
      await Order.deleteMany({});

      const statuses = ['pending', 'confirmed', 'failed'];

      for (const status of statuses) {
        const order = await Order.create({
          customerId: new mongoose.Types.ObjectId().toString(),
          productId: new mongoose.Types.ObjectId().toString(),
          quantity: 1,
          amount: 100000,
          status,
        });

        expect(order.status).toBe(status);
      }
    });

    it('should enforce minimum quantity of 1', async () => {
      await expect(
        Order.create({
          customerId: new mongoose.Types.ObjectId().toString(),
          productId: new mongoose.Types.ObjectId().toString(),
          quantity: 0,
          amount: 100000,
          status: 'pending',
        })
      ).rejects.toHaveProperty('errors.quantity');
    });

    it('should transform _id to id in JSON', async () => {
      const order = await Order.create({
        customerId: new mongoose.Types.ObjectId().toString(),
        productId: new mongoose.Types.ObjectId().toString(),
        quantity: 1,
        amount: 100000,
        status: 'pending',
      });

      const json = order.toJSON();

      expect(json.id).toBeDefined();
      expect(json._id).toBeUndefined();
      expect(json.__v).toBeUndefined();
    });
  });

  describe('GET /orders', () => {
    beforeEach(async () => {
      await Order.deleteMany({});
    });

    it('should return empty list when no orders exist', async () => {
      const response = await request(app).get('/orders').set('x-service-key', API_KEY).expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
      expect(response.body.pagination.hasMore).toBe(false);
    });

    it('should return paginated list of orders', async () => {
      const customerId = new mongoose.Types.ObjectId().toString();
      const productId = new mongoose.Types.ObjectId().toString();

      // Create 3 orders
      await Order.create([
        { customerId, productId, quantity: 1, amount: 100000, status: 'pending' },
        { customerId, productId, quantity: 2, amount: 200000, status: 'confirmed' },
        { customerId, productId, quantity: 3, amount: 300000, status: 'failed' },
      ]);

      const response = await request(app).get('/orders').set('x-service-key', API_KEY).expect(200);

      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination.total).toBe(3);
      expect(response.body.pagination.limit).toBe(20);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.totalPages).toBe(1);
      expect(response.body.pagination.hasMore).toBe(false);
    });

    it('should filter orders by customerId', async () => {
      const customerId1 = new mongoose.Types.ObjectId().toString();
      const customerId2 = new mongoose.Types.ObjectId().toString();
      const productId = new mongoose.Types.ObjectId().toString();

      await Order.create([
        { customerId: customerId1, productId, quantity: 1, amount: 100000, status: 'pending' },
        { customerId: customerId2, productId, quantity: 2, amount: 200000, status: 'pending' },
        { customerId: customerId1, productId, quantity: 3, amount: 300000, status: 'confirmed' },
      ]);

      const response = await request(app)
        .get('/orders')
        .query({ customerId: customerId1 })
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
      response.body.data.forEach((order: { customerId: string }) => {
        expect(order.customerId).toBe(customerId1);
      });
    });

    it('should filter orders by status', async () => {
      const customerId = new mongoose.Types.ObjectId().toString();
      const productId = new mongoose.Types.ObjectId().toString();

      await Order.create([
        { customerId, productId, quantity: 1, amount: 100000, status: 'pending' },
        { customerId, productId, quantity: 2, amount: 200000, status: 'confirmed' },
        { customerId, productId, quantity: 3, amount: 300000, status: 'pending' },
      ]);

      const response = await request(app)
        .get('/orders')
        .query({ status: 'pending' })
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
      response.body.data.forEach((order: { status: string }) => {
        expect(order.status).toBe('pending');
      });
    });

    it('should support pagination with limit and page', async () => {
      const customerId = new mongoose.Types.ObjectId().toString();
      const productId = new mongoose.Types.ObjectId().toString();

      // Create 5 orders
      for (let i = 0; i < 5; i++) {
        await Order.create({
          customerId,
          productId,
          quantity: i + 1,
          amount: (i + 1) * 100000,
          status: 'pending',
        });
      }

      const response = await request(app)
        .get('/orders')
        .query({ limit: 2, page: 2 })
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.total).toBe(5);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.totalPages).toBe(3);
      expect(response.body.pagination.hasMore).toBe(true);
    });

    it('should sort orders by createdAt descending by default', async () => {
      const customerId = new mongoose.Types.ObjectId().toString();
      const productId = new mongoose.Types.ObjectId().toString();

      const order1 = await Order.create({
        customerId,
        productId,
        quantity: 1,
        amount: 100000,
        status: 'pending',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const order2 = await Order.create({
        customerId,
        productId,
        quantity: 2,
        amount: 200000,
        status: 'pending',
      });

      const response = await request(app).get('/orders').set('x-service-key', API_KEY).expect(200);

      expect(response.body.data[0].orderId).toBe(order2._id.toString());
      expect(response.body.data[1].orderId).toBe(order1._id.toString());
    });

    it('should sort orders by amount ascending', async () => {
      const customerId = new mongoose.Types.ObjectId().toString();
      const productId = new mongoose.Types.ObjectId().toString();

      await Order.create([
        { customerId, productId, quantity: 3, amount: 300000, status: 'pending' },
        { customerId, productId, quantity: 1, amount: 100000, status: 'pending' },
        { customerId, productId, quantity: 2, amount: 200000, status: 'pending' },
      ]);

      const response = await request(app)
        .get('/orders')
        .query({ sortBy: 'amount', sortOrder: 'asc' })
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.data[0].amount).toBe(100000);
      expect(response.body.data[1].amount).toBe(200000);
      expect(response.body.data[2].amount).toBe(300000);
    });

    it('should return 400 for invalid customerId format', async () => {
      await request(app)
        .get('/orders')
        .query({ customerId: 'invalid-id' })
        .set('x-service-key', API_KEY)
        .expect(400);
    });

    it('should enforce maximum limit of 100', async () => {
      const response = await request(app)
        .get('/orders')
        .query({ limit: 200 })
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.pagination.limit).toBe(100);
    });
  });

  describe('GET /orders/:id', () => {
    it('should return order by id', async () => {
      const order = await Order.create({
        customerId: new mongoose.Types.ObjectId().toString(),
        productId: new mongoose.Types.ObjectId().toString(),
        quantity: 5,
        amount: 500000,
        status: 'confirmed',
      });

      const response = await request(app)
        .get(`/orders/${order._id}`)
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.orderId).toBe(order._id.toString());
      expect(response.body.quantity).toBe(5);
      expect(response.body.amount).toBe(500000);
      expect(response.body.status).toBe('confirmed');
    });

    it('should return 404 for non-existent order', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      await request(app).get(`/orders/${fakeId}`).set('x-service-key', API_KEY).expect(404);
    });

    it('should return 400 for invalid order id format', async () => {
      await request(app).get('/orders/invalid-id').set('x-service-key', API_KEY).expect(400);
    });

    it('should not include paymentToken for non-pending orders', async () => {
      const order = await Order.create({
        customerId: new mongoose.Types.ObjectId().toString(),
        productId: new mongoose.Types.ObjectId().toString(),
        quantity: 1,
        amount: 100000,
        status: 'confirmed',
        paymentToken: 'some-token',
      });

      const response = await request(app)
        .get(`/orders/${order._id}`)
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.paymentToken).toBeUndefined();
    });

    it('should include paymentToken for pending orders', async () => {
      const order = await Order.create({
        customerId: new mongoose.Types.ObjectId().toString(),
        productId: new mongoose.Types.ObjectId().toString(),
        quantity: 1,
        amount: 100000,
        status: 'pending',
        paymentToken: 'test-payment-token',
      });

      const response = await request(app)
        .get(`/orders/${order._id}`)
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.paymentToken).toBe('test-payment-token');
    });
  });
});
