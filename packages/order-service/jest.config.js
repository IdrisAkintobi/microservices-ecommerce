/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test', '<rootDir>/../shared/test'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@microservice/shared$': '<rootDir>/../shared/src',
  },
  setupFilesAfterEnv: ['<rootDir>/../../jest.setup.js'],
  clearMocks: true,
  restoreMocks: true,
  forceExit: true,
  detectOpenHandles: true,
};
