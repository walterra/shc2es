import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Base Vitest configuration
 * Shared settings for all test types (unit, E2E)
 */
export default defineConfig({
  test: {
    globals: false, // Explicit imports (no global describe/it) - best practice
    environment: 'node',
    include: ['**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', 'coverage'],

    // Coverage configuration (same thresholds as Jest)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/cli.ts', // CLI entry point - tested via E2E
        'src/poll.ts', // CLI script - integration tested
        'src/ingest.ts', // Old CLI script - being replaced
        'src/ingest/**/*.ts', // CLI orchestration - integration tested
        'src/fetch-registry.ts', // CLI script - integration tested
        'src/export-dashboard.ts', // CLI script - integration tested
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },

    // Module resolution
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    // Setup files
    setupFiles: ['./tests/setup.ts'],

    // Clear mocks between tests
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
  },
});
