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
