// Use Jest's automatic mocking
jest.mock('ioredis');
jest.mock('amqplib');

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import * as ioredis from 'ioredis';
import { app } from '../src/app';
import { Transaction } from '../src/models/Transaction';

// Import mocked modules to access mock functions
import * as publisher from '../src/queue/publisher';

describe('Payment Service - API Tests', () => {
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

  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body.status).toBe('ok');
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /payments', () => {
    it('should return 401 without API key', async () => {
      await request(app).post('/payments').send({ token: randomUUID() }).expect(401);
    });

    it('should return 401 with invalid API key', async () => {
      await request(app)
        .post('/payments')
        .set('x-service-key', 'invalid-key')
        .send({ token: randomUUID() })
        .expect(401);
    });

    it('should process payment and call Redis/RabbitMQ methods', async () => {
      const sessionId = randomUUID();
      const orderId = new mongoose.Types.ObjectId().toString();

      // Mock Redis to return session data
      const mockRedis = jest.mocked(new ioredis.default());
      const sessionData = {
        orderId,
        productId: new mongoose.Types.ObjectId().toString(),
        quantity: 2,
        amount: 100000,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(sessionData));
      mockRedis.del.mockResolvedValue(1);

      // Mock RabbitMQ publisher
      const publishSpy = jest.spyOn(publisher, 'publishPaymentSucceeded').mockResolvedValue();

      const response = await request(app)
        .post('/payments')
        .query({ token: sessionId, simulate: 'success' })
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.orderId).toBe(orderId);
      expect(response.body.amount).toBe(100000);

      // Verify Redis methods were called
      expect(mockRedis.get).toHaveBeenCalledWith(`payment:session:${sessionId}`);
      expect(mockRedis.del).toHaveBeenCalledWith(`payment:session:${sessionId}`);

      // Verify RabbitMQ publishing was called
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId,
          transactionId: expect.any(String),
          amount: 100000,
          timestamp: expect.any(String),
        })
      );
    });

    it('should return 400 without token parameter', async () => {
      await request(app).post('/payments').set('x-service-key', API_KEY).expect(400);
    });

    it('should return 409 for expired session', async () => {
      const sessionId = randomUUID();

      // Mock Redis to return null (expired session)
      const mockRedis = jest.mocked(new ioredis.default());
      mockRedis.get.mockResolvedValue(null);

      await request(app)
        .post('/payments')
        .query({ token: sessionId })
        .set('x-service-key', API_KEY)
        .expect(409);

      expect(mockRedis.get).toHaveBeenCalledWith(`payment:session:${sessionId}`);
    });
  });

  describe('Transaction Model', () => {
    it('should create transaction with required fields', async () => {
      await Transaction.deleteMany({});

      const transaction = await Transaction.create({
        transactionId: randomUUID(),
        orderId: new mongoose.Types.ObjectId().toString(),
        amount: 520000,
        status: 'success',
      });

      expect(transaction._id).toBeDefined();
      expect(transaction.transactionId).toBeDefined();
      expect(transaction.orderId).toBeDefined();
      expect(transaction.amount).toBe(520000);
      expect(transaction.status).toBe('success');
      expect(transaction.createdAt).toBeInstanceOf(Date);
    });

    it('should require orderId field', async () => {
      await expect(
        Transaction.create({
          transactionId: randomUUID(),
          amount: 100000,
          status: 'success',
        } as Partial<typeof Transaction.prototype>)
      ).rejects.toHaveProperty('errors.orderId');
    });

    it('should require amount field', async () => {
      await expect(
        Transaction.create({
          transactionId: randomUUID(),
          orderId: new mongoose.Types.ObjectId().toString(),
          status: 'success',
        } as Partial<typeof Transaction.prototype>)
      ).rejects.toHaveProperty('errors.amount');
    });

    it('should validate status enum values', async () => {
      await expect(
        Transaction.create({
          transactionId: randomUUID(),
          orderId: new mongoose.Types.ObjectId().toString(),
          amount: 100000,
          status: 'invalid-status' as 'success' | 'failed',
        })
      ).rejects.toHaveProperty('errors.status');
    });

    it('should accept valid status values', async () => {
      await Transaction.deleteMany({});

      const statuses = ['success', 'failed'];

      for (const status of statuses) {
        const transaction = await Transaction.create({
          transactionId: randomUUID(),
          orderId: new mongoose.Types.ObjectId().toString(),
          amount: 100000,
          status,
        });

        expect(transaction.status).toBe(status);
      }
    });

    it('should enforce positive amount', async () => {
      await expect(
        Transaction.create({
          transactionId: randomUUID(),
          orderId: new mongoose.Types.ObjectId().toString(),
          amount: -100,
          status: 'success',
        })
      ).rejects.toHaveProperty('errors.amount');
    });

    it('should transform _id to id in JSON', async () => {
      const transaction = await Transaction.create({
        transactionId: randomUUID(),
        orderId: new mongoose.Types.ObjectId().toString(),
        amount: 100000,
        status: 'success',
      });

      const json = transaction.toJSON();

      expect(json.id).toBeDefined();
      expect(json.transactionId).toBeDefined();
      expect(json._id).toBeUndefined();
      expect(json.__v).toBeUndefined();
    });
  });
});
