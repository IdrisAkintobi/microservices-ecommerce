// Global test setup
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.SERVICE_API_KEY = 'test-key';
process.env.JWT_SECRET = 'test-secret-key-minimum-32-characters-long-for-jwt';
process.env.VALKEY_URL = 'redis://localhost:6379';
process.env.RABBITMQ_URL = 'amqp://localhost:5672';
process.env.CUSTOMER_SERVICE_URL = 'http://localhost:3001';
process.env.PRODUCT_SERVICE_URL = 'http://localhost:3002';
process.env.PAYMENT_SERVICE_URL = 'http://localhost:3004';
process.env.PORT = '3001'; // Default port for tests
