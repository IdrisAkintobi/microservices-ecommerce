import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../src/app';
import { Customer } from '../src/models/Customer';

// Use Jest's automatic mocking
jest.mock('ioredis');
jest.mock('amqplib');

describe('Customer Service - API Tests', () => {
  let mongoServer: MongoMemoryServer;
  const API_KEY = 'test-key';

  beforeAll(async () => {
    // Start in-memory MongoDB
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

  describe('GET /customers', () => {
    beforeEach(async () => {
      await Customer.deleteMany({});
      await Customer.create([
        { name: 'Alice Johnson', email: 'alice@example.com' },
        { name: 'Bob Smith', email: 'bob@example.com' },
        { name: 'Charlie Brown', email: 'charlie@example.com' },
      ]);
    });

    it('should return 401 without API key', async () => {
      await request(app).get('/customers').expect(401);
    });

    it('should return 200 with list of customers', async () => {
      const response = await request(app)
        .get('/customers')
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(3);

      // Find customers by email since order is not guaranteed
      const alice = response.body.find(
        (c: { email: string; name: string }) => c.email === 'alice@example.com'
      );
      const bob = response.body.find((c: { email: string }) => c.email === 'bob@example.com');
      const charlie = response.body.find(
        (c: { email: string }) => c.email === 'charlie@example.com'
      );

      expect(alice).toBeDefined();
      expect(alice.name).toBe('Alice Johnson');
      expect(alice.id).toBeDefined();
      expect(alice._id).toBeUndefined();
      expect(alice.__v).toBeUndefined();

      expect(bob).toBeDefined();
      expect(charlie).toBeDefined();
    });

    it('should return customers with correct structure', async () => {
      const response = await request(app)
        .get('/customers')
        .set('x-service-key', API_KEY)
        .expect(200);

      const customer = response.body[0];
      expect(customer.id).toBeDefined();
      expect(customer.name).toBeDefined();
      expect(customer.email).toBeDefined();
      expect(customer.createdAt).toBeDefined();
    });
  });

  describe('GET /customers/:id', () => {
    let testCustomerId: string;

    beforeEach(async () => {
      await Customer.deleteMany({});
      const customer = await Customer.create({
        name: 'Test User',
        email: 'test@example.com',
      });
      testCustomerId = customer._id.toString();
    });

    it('should return 401 without API key', async () => {
      await request(app).get(`/customers/${testCustomerId}`).expect(401);
    });

    it('should return 200 with customer data', async () => {
      const response = await request(app)
        .get(`/customers/${testCustomerId}`)
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.name).toBe('Test User');
      expect(response.body.email).toBe('test@example.com');
      expect(response.body.id).toBeDefined();
      expect(response.body._id).toBeUndefined();
      expect(response.body.__v).toBeUndefined();
    });

    it('should return 404 for non-existent customer', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .get(`/customers/${fakeId}`)
        .set('x-service-key', API_KEY)
        .expect(404);

      expect(response.body.error).toBe('Customer not found');
    });

    it('should return 400 for invalid ObjectId format', async () => {
      const response = await request(app)
        .get('/customers/invalid-id')
        .set('x-service-key', API_KEY)
        .expect(400);

      expect(response.body.error).toBe('Invalid customer ID format');
    });
  });

  describe('Customer Model Validation', () => {
    it('should enforce unique email constraint', async () => {
      await Customer.deleteMany({});

      await Customer.create({
        name: 'User One',
        email: 'duplicate@example.com',
      });

      await expect(
        Customer.create({
          name: 'User Two',
          email: 'duplicate@example.com',
        })
      ).rejects.toMatchObject({
        code: 11000,
      });
    });

    it('should require name field', async () => {
      await expect(
        Customer.create({
          email: 'noname@example.com',
        } as Partial<typeof Customer.prototype>)
      ).rejects.toHaveProperty('errors.name');
    });

    it('should require email field', async () => {
      await expect(
        Customer.create({
          name: 'No Email User',
        } as Partial<typeof Customer.prototype>)
      ).rejects.toHaveProperty('errors.email');
    });
  });
});
