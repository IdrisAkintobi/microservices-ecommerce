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
});
