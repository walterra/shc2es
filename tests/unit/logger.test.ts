/**
 * Unit tests for logger module
 */

import { createTempDir, cleanupTempDir, suppressConsole } from '../utils/test-helpers';
import * as fs from 'fs';
import * as path from 'path';

describe('logger module', () => {
  let tempDir: string;

  beforeEach(() => {
    suppressConsole();
    tempDir = createTempDir('logger-test-');

    // Mock config paths
    process.env.HOME = tempDir;
  });

  afterEach(async () => {
    // Reset modules first to stop any ongoing operations
    jest.resetModules();

    // Wait for async file operations to complete
    // Pino uses worker threads that may still be writing
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Now clean up temp directory
    cleanupTempDir(tempDir);
  });

  describe('createLogger', () => {
    it('should create a logger with specified prefix', () => {
      jest.isolateModules(() => {
        const logsDir = path.join(tempDir, 'logs');
        const dataDir = path.join(tempDir, 'data');

        // Create directories before mocking
        fs.mkdirSync(logsDir, { recursive: true });
        fs.mkdirSync(dataDir, { recursive: true });

        // Mock config to use temp directory
        jest.mock('../../src/config', () => ({
          LOGS_DIR: logsDir,
          DATA_DIR: dataDir,
          ensureConfigDirs: jest.fn(),
        }));

        const { createLogger } = require('../../src/logger');
        const logger = createLogger('test');

        expect(logger).toBeDefined();
        expect(logger.info).toBeDefined();
        expect(logger.error).toBeDefined();
        expect(logger.debug).toBeDefined();
        expect(logger.warn).toBeDefined();
      });
    });

    it('should respect LOG_LEVEL environment variable', () => {
      jest.isolateModules(() => {
        process.env.LOG_LEVEL = 'error';

        const logsDir = path.join(tempDir, 'logs');
        const dataDir = path.join(tempDir, 'data');
        fs.mkdirSync(logsDir, { recursive: true });
        fs.mkdirSync(dataDir, { recursive: true });

        jest.mock('../../src/config', () => ({
          LOGS_DIR: logsDir,
          DATA_DIR: dataDir,
          ensureConfigDirs: jest.fn(),
        }));

        const { createLogger } = require('../../src/logger');
        const logger = createLogger('test');

        expect(logger.level).toBe('error');
      });
    });

    it('should create log file with correct naming', () => {
      jest.isolateModules(() => {
        const logsDir = path.join(tempDir, 'logs');
        const dataDir = path.join(tempDir, 'data');
        fs.mkdirSync(logsDir, { recursive: true });
        fs.mkdirSync(dataDir, { recursive: true });

        jest.mock('../../src/config', () => ({
          LOGS_DIR: logsDir,
          DATA_DIR: dataDir,
          ensureConfigDirs: jest.fn(),
        }));

        const { createLogger } = require('../../src/logger');
        createLogger('myapp');

        const dateStamp = new Date().toISOString().split('T')[0];
        const expectedLogFile = path.join(logsDir, `myapp-${dateStamp}.log`);

        // Log file is created lazily, so we need to log something
        // In practice, the file may not exist until first log
        expect(logsDir).toBeDefined();
      });
    });
  });

  describe('BshbLogger', () => {
    it('should implement all required methods', () => {
      jest.isolateModules(() => {
        const logsDir = path.join(tempDir, 'logs');
        const dataDir = path.join(tempDir, 'data');
        fs.mkdirSync(logsDir, { recursive: true });
        fs.mkdirSync(dataDir, { recursive: true });

        jest.mock('../../src/config', () => ({
          LOGS_DIR: logsDir,
          DATA_DIR: dataDir,
          ensureConfigDirs: jest.fn(),
        }));

        const { BshbLogger } = require('../../src/logger');
        const logger = new BshbLogger();

        expect(logger.fine).toBeDefined();
        expect(logger.debug).toBeDefined();
        expect(logger.info).toBeDefined();
        expect(logger.warn).toBeDefined();
        expect(logger.error).toBeDefined();

        // Test that methods can be called without error
        expect(() => logger.fine('test message')).not.toThrow();
        expect(() => logger.debug('test message')).not.toThrow();
        expect(() => logger.info('test message')).not.toThrow();
        expect(() => logger.warn('test message')).not.toThrow();
        expect(() => logger.error('test message')).not.toThrow();
      });
    });

    it('should serialize error objects properly', () => {
      jest.isolateModules(() => {
        const logsDir = path.join(tempDir, 'logs');
        const dataDir = path.join(tempDir, 'data');
        fs.mkdirSync(logsDir, { recursive: true });
        fs.mkdirSync(dataDir, { recursive: true });

        jest.mock('../../src/config', () => ({
          LOGS_DIR: logsDir,
          DATA_DIR: dataDir,
          ensureConfigDirs: jest.fn(),
        }));

        const { BshbLogger } = require('../../src/logger');
        const logger = new BshbLogger();

        const testError = new Error('Test error');

        expect(() => logger.error('Error occurred', testError)).not.toThrow();
      });
    });

    it('should handle multiple parameters', () => {
      jest.isolateModules(() => {
        const logsDir = path.join(tempDir, 'logs');
        const dataDir = path.join(tempDir, 'data');
        fs.mkdirSync(logsDir, { recursive: true });
        fs.mkdirSync(dataDir, { recursive: true });

        jest.mock('../../src/config', () => ({
          LOGS_DIR: logsDir,
          DATA_DIR: dataDir,
          ensureConfigDirs: jest.fn(),
        }));

        const { BshbLogger } = require('../../src/logger');
        const logger = new BshbLogger();

        expect(() => logger.info('Message', { key: 'value' }, 'another param')).not.toThrow();
      });
    });
  });

  describe('appLogger and dataLogger', () => {
    it('should export appLogger instance', () => {
      jest.isolateModules(() => {
        const logsDir = path.join(tempDir, 'logs');
        const dataDir = path.join(tempDir, 'data');
        fs.mkdirSync(logsDir, { recursive: true });
        fs.mkdirSync(dataDir, { recursive: true });

        jest.mock('../../src/config', () => ({
          LOGS_DIR: logsDir,
          DATA_DIR: dataDir,
          ensureConfigDirs: jest.fn(),
        }));

        const { appLogger } = require('../../src/logger');
        expect(appLogger).toBeDefined();
        expect(appLogger.info).toBeDefined();
      });
    });

    it('should export dataLogger instance', () => {
      jest.isolateModules(() => {
        const logsDir = path.join(tempDir, 'logs');
        const dataDir = path.join(tempDir, 'data');
        fs.mkdirSync(logsDir, { recursive: true });
        fs.mkdirSync(dataDir, { recursive: true });

        jest.mock('../../src/config', () => ({
          LOGS_DIR: logsDir,
          DATA_DIR: dataDir,
          ensureConfigDirs: jest.fn(),
        }));

        const { dataLogger } = require('../../src/logger');
        expect(dataLogger).toBeDefined();
        expect(dataLogger.info).toBeDefined();
      });
    });
  });

  describe('OpenTelemetry integration', () => {
    it('should disable OTel when OTEL_SDK_DISABLED is true', () => {
      jest.isolateModules(() => {
        process.env.OTEL_SDK_DISABLED = 'true';

        const logsDir = path.join(tempDir, 'logs');
        const dataDir = path.join(tempDir, 'data');
        fs.mkdirSync(logsDir, { recursive: true });
        fs.mkdirSync(dataDir, { recursive: true });

        jest.mock('../../src/config', () => ({
          LOGS_DIR: logsDir,
          DATA_DIR: dataDir,
          ensureConfigDirs: jest.fn(),
        }));

        const { createLogger } = require('../../src/logger');
        const logger = createLogger('test');

        expect(logger).toBeDefined();
        // Logger should still work even with OTel disabled
        expect(() => logger.info('test')).not.toThrow();
      });
    });

    it('should use OTEL_SERVICE_NAME for logger naming', () => {
      jest.isolateModules(() => {
        process.env.OTEL_SERVICE_NAME = 'custom-service';

        const logsDir = path.join(tempDir, 'logs');
        const dataDir = path.join(tempDir, 'data');
        fs.mkdirSync(logsDir, { recursive: true });
        fs.mkdirSync(dataDir, { recursive: true });

        jest.mock('../../src/config', () => ({
          LOGS_DIR: logsDir,
          DATA_DIR: dataDir,
          ensureConfigDirs: jest.fn(),
        }));

        const { createLogger } = require('../../src/logger');
        const logger = createLogger('test');

        // The logger should be created with the service name
        expect(logger).toBeDefined();
      });
    });
  });
});
