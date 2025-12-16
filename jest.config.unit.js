/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  ...require('./jest.config.js'),
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/e2e/', // Exclude E2E tests from unit test runs
  ],
  testTimeout: 10000, // 10 seconds for unit tests
};
