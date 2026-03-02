/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: ['**/test/**/*.ts', '**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/test/**/*.ts',
  ],
  moduleNameMapper: {
    '^@microservice/shared$': '<rootDir>/packages/shared/src',
    // Map mocks to shared directory
    '^ioredis$': '<rootDir>/packages/shared/test/__mocks__/ioredis.js',
    '^amqplib$': '<rootDir>/packages/shared/test/__mocks__/amqplib.js',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  clearMocks: true,
  restoreMocks: true,
};
