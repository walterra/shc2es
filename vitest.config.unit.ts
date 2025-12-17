import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

/**
 * Vitest configuration for unit tests only
 * Excludes E2E tests, runs faster
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['src/**/*.{test,spec}.ts'],
      exclude: [
        'node_modules',
        'dist',
        'coverage',
        'tests/e2e/**', // Exclude E2E tests from unit runs
      ],
      testTimeout: 10000, // 10 seconds for unit tests
    },
  }),
);
