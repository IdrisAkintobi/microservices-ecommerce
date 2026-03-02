// Jest mock for ioredis - JavaScript version
const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  incrby: jest.fn().mockResolvedValue(1),
  decrby: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  quit: jest.fn().mockResolvedValue('OK'),
  on: jest.fn(),
};

module.exports = jest.fn(() => mockRedis);
