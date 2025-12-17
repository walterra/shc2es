/**
 * Vitest global test setup
 * Runs before each test file
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

// Increase max listeners to avoid warnings during tests
process.setMaxListeners(20);
