/**
 * Jest global test setup
 * Runs once before all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent'; // Suppress logs during tests
process.env.OTEL_SDK_DISABLED = 'true'; // Disable OpenTelemetry in tests

// Mock environment variables for tests
process.env.BSH_HOST = '192.168.1.100';
process.env.BSH_PASSWORD = 'test-password';
process.env.BSH_CLIENT_NAME = 'test-client';
process.env.BSH_CLIENT_ID = 'test-client-id';
process.env.ES_NODE = 'https://localhost:9200';
process.env.ES_PASSWORD = 'test-es-password';
process.env.ES_USER = 'elastic';

// Increase timeout for integration tests
jest.setTimeout(10000);

// Increase max listeners to avoid warnings during tests
process.setMaxListeners(20);

// Global test utilities
global.console = {
  ...console,
  // Suppress console output in tests unless LOG_LEVEL is set
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
