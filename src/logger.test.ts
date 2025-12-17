/**
 * Unit tests for logger module
 */

jest.mock('./config');

import { jest } from '@jest/globals';
import * as fc from 'fast-check';
import { createTempDir, cleanupTempDir } from '../tests/utils/test-helpers';
import * as fs from 'fs';
import * as path from 'path';
import * as config from './config';
import * as logger from './logger';

const mockedConfig = jest.mocked(config);

describe('logger module', () => {
  let tempDir: string;
  let logsDir: string;
  let dataDir: string;

  beforeEach(() => {
    // Create temp directories
    tempDir = createTempDir('logger-test-');
    logsDir = path.join(tempDir, 'logs');
    dataDir = path.join(tempDir, 'data');

    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });

    // Mock config functions
    mockedConfig.getLogsDir.mockReturnValue(logsDir);
    mockedConfig.getDataDir.mockReturnValue(dataDir);
    mockedConfig.ensureConfigDirs.mockImplementation(() => undefined);

    // Suppress console output
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(async () => {
    jest.restoreAllMocks();

    // Wait for async file operations to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    cleanupTempDir(tempDir);
  });

  describe('createLogger', () => {
    it('should create a logger with specified prefix', () => {
      const testLogger = logger.createLogger('test');

      expect(testLogger).toBeDefined();
      expect(typeof testLogger.info).toBe('function');
      expect(typeof testLogger.error).toBe('function');
      expect(typeof testLogger.debug).toBe('function');
      expect(typeof testLogger.warn).toBe('function');
    });
  });

  describe('appLogger', () => {
    it('should be defined and have logging methods', () => {
      expect(logger.appLogger).toBeDefined();
      expect(typeof logger.appLogger.info).toBe('function');
      expect(typeof logger.appLogger.error).toBe('function');
    });
  });

  describe('dataLogger', () => {
    it('should be defined and have logging methods', () => {
      expect(logger.dataLogger).toBeDefined();
      expect(typeof logger.dataLogger.info).toBe('function');
    });
  });

  describe('BshbLogger', () => {
    it('should implement required methods', () => {
      const bshbLogger = new logger.BshbLogger('test');

      expect(typeof bshbLogger.fine).toBe('function');
      expect(typeof bshbLogger.debug).toBe('function');
      expect(typeof bshbLogger.info).toBe('function');
      expect(typeof bshbLogger.warn).toBe('function');
      expect(typeof bshbLogger.error).toBe('function');
    });

    it('should log messages', () => {
      const bshbLogger = new logger.BshbLogger('test');

      // Should not throw
      expect(() => {
        bshbLogger.info('test message');
      }).not.toThrow();
      expect(() => {
        bshbLogger.error('error message', new Error('test'));
      }).not.toThrow();
    });
  });

  describe('serializeError', () => {
    it('should handle non-Error objects', () => {
      const result = logger.serializeError({ custom: 'error' });

      expect(result['error.message']).toBe('[object Object]');
      expect(result['error.type']).toBe('object');
    });

    it('should handle null and undefined', () => {
      const nullResult = logger.serializeError(null);
      expect(nullResult['error.message']).toBe('null');
      expect(nullResult['error.type']).toBe('object');

      const undefinedResult = logger.serializeError(undefined);
      expect(undefinedResult['error.message']).toBe('undefined');
      expect(undefinedResult['error.type']).toBe('undefined');
    });

    it('should use ECS-compliant field names', () => {
      const error = new Error('Test');
      const result = logger.serializeError(error);

      // Check for dotted notation (ECS compliant)
      expect(Object.keys(result)).toContain('error.message');
      expect(Object.keys(result)).toContain('error.type');
      expect(Object.keys(result)).toContain('error.stack_trace');

      // Ensure no old field names
      expect(Object.keys(result)).not.toContain('err');
      expect(Object.keys(result)).not.toContain('message');
      expect(Object.keys(result)).not.toContain('type');
    });

    describe('Property-based tests', () => {
      it('should never throw for any reasonable input', () => {
        // Use safe values that won't have broken toString methods
        const reasonableValues = fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.string().map((msg) => new Error(msg)),
          fc.record({
            message: fc.string(),
            code: fc.option(fc.string()),
          }),
        );

        fc.assert(
          fc.property(reasonableValues, (value) => {
            expect(() => logger.serializeError(value)).not.toThrow();
          }),
        );
      });

      it('should always produce ECS-compliant output', () => {
        const reasonableValues = fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.string().map((msg) => new Error(msg)),
        );

        fc.assert(
          fc.property(reasonableValues, (value) => {
            const result = logger.serializeError(value);

            // Must have required ECS fields
            expect(result['error.message']).toBeDefined();
            expect(result['error.type']).toBeDefined();

            // Fields must be correct types
            expect(typeof result['error.message']).toBe('string');
            expect(typeof result['error.type']).toBe('string');
          }),
        );
      });

      it('should preserve Error message for all Error instances', () => {
        fc.assert(
          fc.property(fc.string(), (message: string) => {
            const error = new Error(message);
            const result = logger.serializeError(error);

            expect(result['error.message']).toBe(message);
            expect(result['error.type']).toBe('Error');
            expect(result['error.stack_trace']).toBeDefined();
            expect(typeof result['error.stack_trace']).toBe('string');
          }),
        );
      });

      it('should recursively serialize error cause chains', () => {
        fc.assert(
          fc.property(fc.string(), fc.string(), (topMessage: string, causeMessage: string) => {
            const cause = new Error(causeMessage);
            const error = new Error(topMessage, { cause });
            const result = logger.serializeError(error);

            expect(result['error.message']).toBe(topMessage);
            expect(result['error.cause']).toBeDefined();

            const serializedCause = result['error.cause'] as Record<string, unknown>;
            expect(serializedCause['error.message']).toBe(causeMessage);
            expect(serializedCause['error.type']).toBe('Error');
          }),
        );
      });

      it('should handle string errors with arbitrary content', () => {
        fc.assert(
          fc.property(fc.string(), (errorString: string) => {
            const result = logger.serializeError(errorString);

            expect(result['error.message']).toBe(errorString);
            expect(result['error.type']).toBe('string');
          }),
        );
      });

      it('should handle custom error classes with arbitrary names', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1 }),
            fc.string(),
            (errorName: string, message: string) => {
              class CustomError extends Error {
                constructor(msg: string) {
                  super(msg);
                  this.name = errorName;
                }
              }

              const error = new CustomError(message);
              const result = logger.serializeError(error);

              expect(result['error.message']).toBe(message);
              expect(result['error.type']).toBe(errorName);
            },
          ),
        );
      });
    });
  });
});
