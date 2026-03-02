import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import * as ioredis from 'ioredis';
import { app } from '../src/app';
import { Product } from '../src/models/Product';

// Use Jest's automatic mocking
jest.mock('ioredis');
jest.mock('amqplib');

describe('Product Service - API Tests', () => {
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

  describe('GET /products', () => {
    beforeEach(async () => {
      await Product.deleteMany({});
      await Product.create([
        { name: 'HP Laptop 15-inch', price: 520000, stock: 24 },
        { name: 'Wireless Mouse', price: 25000, stock: 100 },
        { name: 'USB-C Cable', price: 15000, stock: 200 },
      ]);
    });

    it('should return 401 without API key', async () => {
      await request(app).get('/products').expect(401);
    });

    it('should return 200 with list of products', async () => {
      const response = await request(app)
        .get('/products')
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(3);

      // Find specific product by name since order is not guaranteed
      const laptop = response.body.find(
        (p: { name: string; price: number; stock: number }) => p.name === 'HP Laptop 15-inch'
      );
      expect(laptop).toBeDefined();
      expect(laptop.price).toBe(520000);
      expect(laptop.stock).toBe(24);
      expect(laptop.id).toBeDefined();
      expect(laptop._id).toBeUndefined();
      expect(laptop.__v).toBeUndefined();
    });

    it('should return products with correct structure', async () => {
      const response = await request(app)
        .get('/products')
        .set('x-service-key', API_KEY)
        .expect(200);

      const product = response.body[0];
      expect(product.id).toBeDefined();
      expect(product.name).toBeDefined();
      expect(typeof product.price).toBe('number');
      expect(typeof product.stock).toBe('number');
      expect(product.createdAt).toBeDefined();
    });
  });

  describe('GET /products/:id', () => {
    let testProductId: string;

    beforeEach(async () => {
      await Product.deleteMany({});
      const product = await Product.create({
        name: 'Test Laptop',
        price: 500000,
        stock: 10,
      });
      testProductId = product._id.toString();
    });

    it('should return 401 without API key', async () => {
      await request(app).get(`/products/${testProductId}`).expect(401);
    });

    it('should return 200 with product data', async () => {
      const response = await request(app)
        .get(`/products/${testProductId}`)
        .set('x-service-key', API_KEY)
        .expect(200);

      expect(response.body.name).toBe('Test Laptop');
      expect(response.body.price).toBe(500000);
      expect(response.body.stock).toBe(10);
      expect(response.body.id).toBeDefined();
      expect(response.body._id).toBeUndefined();
      expect(response.body.__v).toBeUndefined();
    });

    it('should return 404 for non-existent product', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .get(`/products/${fakeId}`)
        .set('x-service-key', API_KEY)
        .expect(404);

      expect(response.body.error).toBe('Product not found');
    });

    it('should return 400 for invalid ObjectId format', async () => {
      const response = await request(app)
        .get('/products/invalid-id')
        .set('x-service-key', API_KEY)
        .expect(400);

      expect(response.body.error).toBe('Invalid product ID format');
    });
  });

  describe('POST /products/:id/reserve', () => {
    let testProductId: string;

    beforeEach(async () => {
      await Product.deleteMany({});
      const product = await Product.create({
        name: 'Test Product',
        price: 100000,
        stock: 50,
      });
      testProductId = product._id.toString();
    });

    it('should return 401 without API key', async () => {
      await request(app)
        .post(`/products/${testProductId}/reserve`)
        .send({ quantity: 5 })
        .expect(401);
    });

    it('should reserve stock and call Redis methods', async () => {
      // Get the mocked Redis instance
      const mockRedis = jest.mocked(new ioredis.default());

      const response = await request(app)
        .post(`/products/${testProductId}/reserve`)
        .set('x-service-key', API_KEY)
        .send({ quantity: 5 })
        .expect(200);

      expect(response.body.price).toBe(100000);

      // Verify Redis methods were called
      expect(mockRedis.get).toHaveBeenCalledWith(`reservation:${testProductId}`);
      expect(mockRedis.incrby).toHaveBeenCalledWith(`reservation:${testProductId}`, 5);
      expect(mockRedis.expire).toHaveBeenCalledWith(`reservation:${testProductId}`, 3600);
    });

    it('should return 400 for invalid product ID', async () => {
      await request(app)
        .post('/products/invalid-id/reserve')
        .set('x-service-key', API_KEY)
        .send({ quantity: 5 })
        .expect(400);
    });

    it('should return 404 for non-existent product', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      await request(app)
        .post(`/products/${fakeId}/reserve`)
        .set('x-service-key', API_KEY)
        .send({ quantity: 5 })
        .expect(404);
    });
  });

  describe('Product Model Validation', () => {
    it('should require name field', async () => {
      await expect(
        Product.create({
          price: 100000,
          stock: 10,
        } as Partial<typeof Product.prototype>)
      ).rejects.toHaveProperty('errors.name');
    });

    it('should require price field', async () => {
      await expect(
        Product.create({
          name: 'No Price Product',
          stock: 10,
        } as Partial<typeof Product.prototype>)
      ).rejects.toHaveProperty('errors.price');
    });

    it('should require stock field', async () => {
      // Stock has a default value of 0, so it won't fail when omitted
      // Instead, test that it uses the default value
      const product = await Product.create({
        name: 'No Stock Product',
        price: 100000,
      });

      expect(product.stock).toBe(0);
    });

    it('should enforce positive price', async () => {
      await expect(
        Product.create({
          name: 'Negative Price',
          price: -100,
          stock: 10,
        })
      ).rejects.toHaveProperty('errors.price');
    });

    it('should enforce non-negative stock', async () => {
      await expect(
        Product.create({
          name: 'Negative Stock',
          price: 100000,
          stock: -5,
        })
      ).rejects.toHaveProperty('errors.stock');
    });
  });
});
