/**
 * Vitest setup for E2E tests
 * Runs before each E2E test file
 *
 * Unlike unit tests, E2E tests should show console output for debugging
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'info'; // Enable logs for E2E tests
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

// DO NOT suppress console output for E2E tests - we want to see container startup logs
// Keep console as-is for debugging
