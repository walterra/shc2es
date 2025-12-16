/** @type {import('ts-jest').JestConfigWithTsJest} */
const baseConfig = require('./jest.config.js');

module.exports = {
  ...baseConfig,
  testMatch: [
    '**/tests/e2e/**/*.test.ts',
    '**/tests/e2e/**/*.e2e.test.ts',
  ],
  globalSetup: '<rootDir>/tests/global-setup.e2e.ts', // Start containers once before all tests
  globalTeardown: '<rootDir>/tests/global-teardown.e2e.ts', // Stop containers once after all tests
  setupFilesAfterEnv: ['<rootDir>/tests/setup.e2e.ts'], // Use E2E-specific setup (enables console logs)
  testTimeout: 180000, // 3 minutes for E2E tests (container startup)
  maxWorkers: 1, // Run E2E tests sequentially to avoid resource contention
  collectCoverage: false, // E2E tests don't contribute to unit test coverage
  forceExit: false, // Containers cleaned up properly in globalTeardown
};
