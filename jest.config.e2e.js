/** @type {import('ts-jest').JestConfigWithTsJest} */
const baseConfig = require('./jest.config.js');

module.exports = {
  ...baseConfig,
  testMatch: [
    '**/tests/e2e/**/*.test.ts',
    '**/tests/e2e/**/*.e2e.test.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.e2e.ts'], // Use E2E-specific setup (enables console logs)
  testTimeout: 180000, // 3 minutes for E2E tests (container startup)
  maxWorkers: 1, // Run E2E tests sequentially to avoid resource contention
  collectCoverage: false, // E2E tests don't contribute to unit test coverage
  forceExit: true, // Force exit after tests complete (containers may leave open handles)
};
