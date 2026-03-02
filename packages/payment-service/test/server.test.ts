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

  describe('GET /payments/transactions', () => {
    beforeEach(async () => {
      await Transaction.deleteMany({});
    });

    it('should return empty list when no transactions exist', async () => {
      const response = await request(app)
        .get('/payments/transactions')
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
      expect(response.body.pagination.hasMore).toBe(false);
    });

    it('should return paginated list of transactions', async () => {
      const orderId = new mongoose.Types.ObjectId().toString();

      // Create 3 transactions
      await Transaction.create([
        { transactionId: randomUUID(), orderId, amount: 100000, status: 'success' },
        { transactionId: randomUUID(), orderId, amount: 200000, status: 'success' },
        {
          transactionId: randomUUID(),
          orderId,
          amount: 300000,
          status: 'failed',
          error: 'Declined',
        },
      ]);

      const response = await request(app)
        .get('/payments/transactions')
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination.total).toBe(3);
      expect(response.body.pagination.limit).toBe(20);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.totalPages).toBe(1);
      expect(response.body.pagination.hasMore).toBe(false);
    });

    it('should filter transactions by orderId', async () => {
      const orderId1 = new mongoose.Types.ObjectId().toString();
      const orderId2 = new mongoose.Types.ObjectId().toString();

      await Transaction.create([
        { transactionId: randomUUID(), orderId: orderId1, amount: 100000, status: 'success' },
        { transactionId: randomUUID(), orderId: orderId2, amount: 200000, status: 'success' },
        { transactionId: randomUUID(), orderId: orderId1, amount: 300000, status: 'failed' },
      ]);

      const response = await request(app)
        .get('/payments/transactions')
        .query({ orderId: orderId1 })
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
      response.body.data.forEach((txn: { orderId: string }) => {
        expect(txn.orderId).toBe(orderId1);
      });
    });

    it('should filter transactions by status', async () => {
      const orderId = new mongoose.Types.ObjectId().toString();

      await Transaction.create([
        { transactionId: randomUUID(), orderId, amount: 100000, status: 'success' },
        { transactionId: randomUUID(), orderId, amount: 200000, status: 'failed' },
        { transactionId: randomUUID(), orderId, amount: 300000, status: 'success' },
      ]);

      const response = await request(app)
        .get('/payments/transactions')
        .query({ status: 'success' })
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
      response.body.data.forEach((txn: { status: string }) => {
        expect(txn.status).toBe('success');
      });
    });

    it('should support pagination with limit and page', async () => {
      const orderId = new mongoose.Types.ObjectId().toString();

      // Create 5 transactions
      for (let i = 0; i < 5; i++) {
        await Transaction.create({
          transactionId: randomUUID(),
          orderId,
          amount: (i + 1) * 100000,
          status: 'success',
        });
      }

      const response = await request(app)
        .get('/payments/transactions')
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

    it('should sort transactions by createdAt descending by default', async () => {
      const orderId = new mongoose.Types.ObjectId().toString();

      const txn1 = await Transaction.create({
        transactionId: randomUUID(),
        orderId,
        amount: 100000,
        status: 'success',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const txn2 = await Transaction.create({
        transactionId: randomUUID(),
        orderId,
        amount: 200000,
        status: 'success',
      });

      const response = await request(app)
        .get('/payments/transactions')
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.data[0].transactionId).toBe(txn2.transactionId);
      expect(response.body.data[1].transactionId).toBe(txn1.transactionId);
    });

    it('should sort transactions by amount ascending', async () => {
      const orderId = new mongoose.Types.ObjectId().toString();

      await Transaction.create([
        { transactionId: randomUUID(), orderId, amount: 300000, status: 'success' },
        { transactionId: randomUUID(), orderId, amount: 100000, status: 'success' },
        { transactionId: randomUUID(), orderId, amount: 200000, status: 'success' },
      ]);

      const response = await request(app)
        .get('/payments/transactions')
        .query({ sortBy: 'amount', sortOrder: 'asc' })
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.data[0].amount).toBe(100000);
      expect(response.body.data[1].amount).toBe(200000);
      expect(response.body.data[2].amount).toBe(300000);
    });

    it('should enforce maximum limit of 100', async () => {
      const response = await request(app)
        .get('/payments/transactions')
        .query({ limit: 200 })
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.pagination.limit).toBe(100);
    });

    it('should return 401 without API key', async () => {
      await request(app).get('/payments/transactions').expect(401);
    });
  });

  describe('GET /payments/transactions/:id', () => {
    it('should return transaction by id', async () => {
      const transactionId = randomUUID();
      const orderId = new mongoose.Types.ObjectId().toString();

      await Transaction.create({
        transactionId,
        orderId,
        amount: 500000,
        status: 'success',
      });

      const response = await request(app)
        .get(`/payments/transactions/${transactionId}`)
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.transactionId).toBe(transactionId);
      expect(response.body.orderId).toBe(orderId);
      expect(response.body.amount).toBe(500000);
      expect(response.body.status).toBe('success');
    });

    it('should return transaction with error field for failed transactions', async () => {
      const transactionId = randomUUID();
      const orderId = new mongoose.Types.ObjectId().toString();

      await Transaction.create({
        transactionId,
        orderId,
        amount: 100000,
        status: 'failed',
        error: 'Payment declined by gateway',
      });

      const response = await request(app)
        .get(`/payments/transactions/${transactionId}`)
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.status).toBe('failed');
      expect(response.body.error).toBe('Payment declined by gateway');
    });

    it('should return 404 for non-existent transaction', async () => {
      const fakeId = randomUUID();
      await request(app)
        .get(`/payments/transactions/${fakeId}`)
        .set('x-service-key', API_KEY)
        .expect(404);
    });

    it('should return 401 without API key', async () => {
      const transactionId = randomUUID();
      await request(app).get(`/payments/transactions/${transactionId}`).expect(401);
    });
  });
});
