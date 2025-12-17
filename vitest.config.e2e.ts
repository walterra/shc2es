import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest configuration for E2E tests
 * Uses TestContainers, longer timeouts, sequential execution
 *
 * Note: Does NOT merge with base config to avoid running unit tests
 */
export default defineConfig({
  test: {
    globals: false, // Explicit imports (no global describe/it)
    environment: 'node',
    include: ['tests/e2e/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', 'coverage'],

    // Global setup for containers (teardown returned from setup function in Vitest)
    globalSetup: ['./tests/global-setup.e2e.ts'],

    // E2E-specific setup
    setupFiles: ['./tests/setup.e2e.ts'],

    // Long timeouts for container startup
    testTimeout: 180000, // 3 minutes
    hookTimeout: 180000,

    // Run E2E tests sequentially to avoid resource contention (Vitest 4 syntax)
    pool: 'forks',
    poolMatch: undefined,
    singleFork: true, // Top-level in Vitest 4 (was poolOptions.forks.singleFork)

    // Don't collect coverage for E2E tests
    coverage: {
      enabled: false,
    },

    // Module resolution
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    // Clear mocks between tests
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
  },
});
