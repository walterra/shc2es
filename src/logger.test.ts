/**
 * Unit tests for logger module
 */

jest.mock('./config');

import { jest } from '@jest/globals';
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

    it('should create log file with correct naming', () => {
      logger.createLogger('test-script');

      // Wait a bit for file creation
      setTimeout(() => {
        const files = fs.readdirSync(logsDir);
        const hasTestLog = files.some((f) => f.startsWith('test-script-'));
        expect(hasTestLog).toBe(true);
      }, 100);
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
    it('should serialize Error with all fields', () => {
      const error = new Error('Test error message');
      const result = logger.serializeError(error);

      expect(result['error.message']).toBe('Test error message');
      expect(result['error.type']).toBe('Error');
      expect(result['error.stack_trace']).toBeDefined();
      expect(typeof result['error.stack_trace']).toBe('string');
    });

    it('should serialize error with code property', () => {
      const error = new Error('Connection failed') as Error & { code: string };
      error.code = 'ECONNREFUSED';
      const result = logger.serializeError(error);

      expect(result['error.message']).toBe('Connection failed');
      expect(result['error.code']).toBe('ECONNREFUSED');
      expect(result['error.type']).toBe('Error');
    });

    it('should serialize error with errno property', () => {
      const error = new Error('File not found') as Error & { errno: number };
      error.errno = -2;
      const result = logger.serializeError(error);

      expect(result['error.message']).toBe('File not found');
      expect(result['error.errno']).toBe(-2);
    });

    it('should recursively serialize error cause', () => {
      const cause = new Error('Root cause');
      const error = new Error('Top level error', { cause });
      const result = logger.serializeError(error);

      expect(result['error.message']).toBe('Top level error');
      expect(result['error.cause']).toBeDefined();

      const serializedCause = result['error.cause'] as Record<string, unknown>;
      expect(serializedCause['error.message']).toBe('Root cause');
      expect(serializedCause['error.type']).toBe('Error');
    });

    it('should handle string errors', () => {
      const result = logger.serializeError('Simple error string');

      expect(result['error.message']).toBe('Simple error string');
      expect(result['error.type']).toBe('string');
    });

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

    it('should handle custom error classes', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const error = new CustomError('Custom error occurred');
      const result = logger.serializeError(error);

      expect(result['error.message']).toBe('Custom error occurred');
      expect(result['error.type']).toBe('CustomError');
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
  });

  describe('logErrorAndExit', () => {
    let exitSpy: jest.SpiedFunction<typeof process.exit>;

    beforeEach(() => {
      exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    });

    afterEach(() => {
      exitSpy.mockRestore();
    });

    it('should log error and exit with code 1', () => {
      const error = { message: 'Test error' };

      logger.logErrorAndExit(error, 'Fatal error occurred');

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle Error instances', () => {
      const error = new Error('Test error');

      logger.logErrorAndExit(error, 'Fatal error occurred');

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
