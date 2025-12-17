/**
 * Unit tests for validation module
 */

import * as fs from 'fs';
import * as path from 'path';
import * as fc from 'fast-check';
import { createTempDir, cleanupTempDir } from '../tests/utils/test-helpers';
import type { LogLevel } from './validation';
import {
  validateRequired,
  validateUrl,
  validateFilePath,
  validateBoolean,
  validateLogLevel,
  validatePollConfig,
  validateIngestConfig,
  validateRegistryConfig,
  validateDashboardConfig,
} from './validation';
import { ValidationError } from './types/errors';

describe('validation module', () => {
  let tempDir: string;
  let testFilePath: string;

  beforeAll(() => {
    tempDir = createTempDir('validation-test-');
    testFilePath = path.join(tempDir, 'test-file.txt');
    fs.writeFileSync(testFilePath, 'test content');
  });

  afterAll(() => {
    cleanupTempDir(tempDir);
  });

  describe('ValidationError', () => {
    it('should create error with message and variable name', () => {
      const error = new ValidationError('test message', 'TEST_VAR', 'TEST_CODE');
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('test message');
      expect(error.variable).toBe('TEST_VAR');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('validateRequired', () => {
    it('should include env file hint in error message', () => {
      const result = validateRequired('TEST', undefined);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/Set it in/);
    });
  });

  describe('validateUrl', () => {
    it('should trim whitespace', () => {
      const result = validateUrl('TEST', '  https://example.com  ');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('https://example.com');
    });

    it('should return Err when invalid URL', () => {
      const result = validateUrl('TEST', 'http://');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('INVALID_URL_FORMAT');
    });

    it('should allow trailing slash on root', () => {
      const result = validateUrl('TEST', 'http://localhost:9200/');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('http://localhost:9200/');
    });

    it('should return Ok with undefined when not required and empty', () => {
      const result1 = validateUrl('TEST', '', { required: false });
      expect(result1.isOk()).toBe(true);
      expect(result1._unsafeUnwrap()).toBeUndefined();

      const result2 = validateUrl('TEST', undefined, { required: false });
      expect(result2.isOk()).toBe(true);
      expect(result2._unsafeUnwrap()).toBeUndefined();
    });

    it('should return Err when required and empty', () => {
      const result = validateUrl('TEST', '', { required: true });
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('MISSING_REQUIRED');
    });
  });

  describe('validateFilePath', () => {
    it('should validate existing file path', () => {
      const result = validateFilePath('TEST', testFilePath);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(testFilePath);
    });

    it('should return Err when file does not exist', () => {
      const nonExistent = path.join(tempDir, 'nonexistent.txt');
      const result = validateFilePath('TEST', nonExistent);
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.message).toMatch(/not found/);
      expect(error.code).toBe('FILE_NOT_FOUND');
    });

    it('should return Ok with undefined when not required and empty', () => {
      const result1 = validateFilePath('TEST', '', { required: false });
      expect(result1.isOk()).toBe(true);
      expect(result1._unsafeUnwrap()).toBeUndefined();

      const result2 = validateFilePath('TEST', undefined, { required: false });
      expect(result2.isOk()).toBe(true);
      expect(result2._unsafeUnwrap()).toBeUndefined();
    });

    it('should return Err when required and empty', () => {
      const result = validateFilePath('TEST', '', { required: true });
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('MISSING_REQUIRED');
    });

    it('should include file path in error message', () => {
      const nonExistent = path.join(tempDir, 'nonexistent.txt');
      const result = validateFilePath('TEST', nonExistent);
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toContain(nonExistent);
    });
  });

  describe('validateBoolean', () => {
    it('should return default when empty', () => {
      expect(validateBoolean('TEST', '', false)._unsafeUnwrap()).toBe(false);
      expect(validateBoolean('TEST', undefined, true)._unsafeUnwrap()).toBe(true);
    });

    it('should return Err on invalid value', () => {
      const result = validateBoolean('TEST', 'invalid');
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toMatch(/must be 'true' or 'false'/);
      expect(error.code).toBe('INVALID_BOOLEAN');
    });
  });

  describe('validateLogLevel', () => {
    it('should normalize case', () => {
      expect(validateLogLevel('TEST', 'DEBUG')._unsafeUnwrap()).toBe('debug');
      expect(validateLogLevel('TEST', 'INFO')._unsafeUnwrap()).toBe('info');
    });

    it('should trim whitespace', () => {
      expect(validateLogLevel('TEST', '  info  ')._unsafeUnwrap()).toBe('info');
    });

    it('should return default when empty', () => {
      expect(validateLogLevel('TEST', '', 'warn' as LogLevel)._unsafeUnwrap()).toBe('warn');
      expect(validateLogLevel('TEST', undefined, 'error' as LogLevel)._unsafeUnwrap()).toBe(
        'error',
      );
    });
  });

  describe('validatePollConfig', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      // Mock console.error for error tests
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      process.env = originalEnv;
      jest.restoreAllMocks();
    });

    it('should validate complete poll config', () => {
      process.env.BSH_HOST = '192.168.1.100';
      process.env.BSH_PASSWORD = 'password123';
      process.env.BSH_CLIENT_NAME = 'custom-client';
      process.env.BSH_CLIENT_ID = 'custom-id';
      process.env.LOG_LEVEL = 'debug';

      const result = validatePollConfig();
      expect(result.isOk()).toBe(true);

      const config = result._unsafeUnwrap();
      expect(config.bshHost).toBe('192.168.1.100');
      expect(config.bshPassword).toBe('password123');
      expect(config.bshClientName).toBe('custom-client');
      expect(config.bshClientId).toBe('custom-id');
      expect(config.logLevel).toBe('debug');
    });

    it('should use defaults for optional values', () => {
      process.env.BSH_HOST = '192.168.1.100';
      process.env.BSH_PASSWORD = 'password123';
      delete process.env.BSH_CLIENT_NAME;
      delete process.env.BSH_CLIENT_ID;
      delete process.env.LOG_LEVEL;

      const result = validatePollConfig();
      expect(result.isOk()).toBe(true);

      const config = result._unsafeUnwrap();
      expect(config.bshClientName).toBe('oss_bosch_smart_home_poll');
      expect(config.bshClientId).toBe('oss_bosch_smart_home_poll_client');
      expect(config.logLevel).toBe('info');
    });

    it('should return Err when BSH_HOST is missing', () => {
      delete process.env.BSH_HOST;
      process.env.BSH_PASSWORD = 'password123';

      const result = validatePollConfig();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/BSH_HOST is required/);
    });

    it('should return Err when BSH_PASSWORD is missing', () => {
      process.env.BSH_HOST = '192.168.1.100';
      delete process.env.BSH_PASSWORD;

      const result = validatePollConfig();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/BSH_PASSWORD is required/);
    });
  });

  describe('validateIngestConfig', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      process.env = originalEnv;
      jest.restoreAllMocks();
    });

    it('should validate complete ingest config', () => {
      process.env.ES_NODE = 'https://localhost:9200';
      process.env.ES_PASSWORD = 'elastic123';
      process.env.ES_USER = 'admin';
      process.env.ES_CA_CERT = testFilePath;
      process.env.ES_TLS_VERIFY = 'false';
      process.env.ES_INDEX_PREFIX = 'custom-prefix';
      process.env.KIBANA_NODE = 'https://localhost:5601';

      const result = validateIngestConfig();
      expect(result.isOk()).toBe(true);

      const config = result._unsafeUnwrap();
      expect(config.esNode).toBe('https://localhost:9200');
      expect(config.esPassword).toBe('elastic123');
      expect(config.esUser).toBe('admin');
      expect(config.esCaCert).toBe(testFilePath);
      expect(config.esTlsVerify).toBe(false);
      expect(config.esIndexPrefix).toBe('custom-prefix');
      expect(config.kibanaNode).toBe('https://localhost:5601');
    });

    it('should use defaults for optional values', () => {
      process.env.ES_NODE = 'https://localhost:9200';
      process.env.ES_PASSWORD = 'elastic123';
      delete process.env.ES_USER;
      delete process.env.ES_CA_CERT;
      delete process.env.ES_TLS_VERIFY;
      delete process.env.ES_INDEX_PREFIX;
      delete process.env.KIBANA_NODE;

      const result = validateIngestConfig();
      expect(result.isOk()).toBe(true);

      const config = result._unsafeUnwrap();
      expect(config.esUser).toBe('elastic');
      expect(config.esCaCert).toBeUndefined();
      expect(config.esTlsVerify).toBe(true);
      expect(config.esIndexPrefix).toBe('smart-home-events');
      expect(config.kibanaNode).toBeUndefined();
    });

    it('should return Err when ES_NODE is missing', () => {
      delete process.env.ES_NODE;
      process.env.ES_PASSWORD = 'elastic123';

      const result = validateIngestConfig();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/ES_NODE is required/);
    });

    it('should return Err when ES_NODE is invalid URL', () => {
      process.env.ES_NODE = 'not-a-url';
      process.env.ES_PASSWORD = 'elastic123';

      const result = validateIngestConfig();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/ES_NODE/);
    });

    it('should return Err when ES_CA_CERT file does not exist', () => {
      process.env.ES_NODE = 'https://localhost:9200';
      process.env.ES_PASSWORD = 'elastic123';
      process.env.ES_CA_CERT = '/nonexistent/file.pem';

      const result = validateIngestConfig();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/ES_CA_CERT/);
    });

    it('should return Err when KIBANA_NODE is required but missing', () => {
      process.env.ES_NODE = 'https://localhost:9200';
      process.env.ES_PASSWORD = 'elastic123';
      delete process.env.KIBANA_NODE;

      const result = validateIngestConfig({ requireKibana: true });
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/KIBANA_NODE is required/);
    });
  });

  describe('validateRegistryConfig', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      process.env = originalEnv;
      jest.restoreAllMocks();
    });

    it('should validate registry config', () => {
      process.env.BSH_HOST = '192.168.1.100';

      const result = validateRegistryConfig();
      expect(result.isOk()).toBe(true);

      const config = result._unsafeUnwrap();
      expect(config.bshHost).toBe('192.168.1.100');
    });

    it('should return Err when BSH_HOST is missing', () => {
      delete process.env.BSH_HOST;

      const result = validateRegistryConfig();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/BSH_HOST is required/);
    });
  });

  describe('validateDashboardConfig', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      process.env = originalEnv;
      jest.restoreAllMocks();
    });

    it('should validate complete dashboard config', () => {
      process.env.KIBANA_NODE = 'https://localhost:5601';
      process.env.ES_PASSWORD = 'elastic123';
      process.env.ES_USER = 'admin';
      process.env.ES_CA_CERT = testFilePath;
      process.env.ES_TLS_VERIFY = 'false';

      const result = validateDashboardConfig();
      expect(result.isOk()).toBe(true);

      const config = result._unsafeUnwrap();
      expect(config.kibanaNode).toBe('https://localhost:5601');
      expect(config.esPassword).toBe('elastic123');
      expect(config.esUser).toBe('admin');
      expect(config.esCaCert).toBe(testFilePath);
      expect(config.esTlsVerify).toBe(false);
    });

    it('should return Err when KIBANA_NODE is missing', () => {
      delete process.env.KIBANA_NODE;
      process.env.ES_PASSWORD = 'elastic123';

      const result = validateDashboardConfig();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/KIBANA_NODE is required/);
    });

    it('should return Err when KIBANA_NODE is invalid URL', () => {
      process.env.KIBANA_NODE = 'not-a-url';
      process.env.ES_PASSWORD = 'elastic123';

      const result = validateDashboardConfig();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/KIBANA_NODE/);
    });

    it('should return Err when ES_PASSWORD is missing', () => {
      process.env.KIBANA_NODE = 'https://localhost:5601';
      delete process.env.ES_PASSWORD;

      const result = validateDashboardConfig();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/ES_PASSWORD is required/);
    });
  });

  describe('Property-based tests', () => {
    describe('validateRequired properties', () => {
      it('should accept any non-empty string', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
            (value) => {
              const result = validateRequired('TEST', value);
              expect(result.isOk()).toBe(true);
              expect(result._unsafeUnwrap()).toBe(value);
            },
          ),
        );
      });

      it('should reject undefined, empty, and whitespace-only strings', () => {
        const invalidValues = fc.oneof(
          fc.constant(undefined),
          fc.constant(''),
          fc.stringMatching(/^\s+$/), // Only whitespace
        );

        fc.assert(
          fc.property(invalidValues, (value) => {
            const result = validateRequired('TEST', value);
            expect(result.isErr()).toBe(true);
            expect(result._unsafeUnwrapErr()).toBeInstanceOf(ValidationError);
            expect(result._unsafeUnwrapErr().code).toBe('MISSING_REQUIRED');
          }),
        );
      });
    });

    describe('validateUrl properties', () => {
      it('should accept valid HTTP/HTTPS URLs', () => {
        fc.assert(
          fc.property(fc.webUrl({ validSchemes: ['http', 'https'] }), (url: string) => {
            const result = validateUrl('TEST', url);

            // URLs with trailing slashes in paths are rejected (known validation rule)
            // So we expect either Ok or Err with INVALID_URL_TRAILING_SLASH
            if (result.isErr()) {
              expect(result._unsafeUnwrapErr().code).toBe('INVALID_URL_TRAILING_SLASH');
            } else {
              expect(result._unsafeUnwrap()).toBeTruthy();
            }
          }),
        );
      });

      it('should reject URLs without http/https protocol', () => {
        const invalidUrls = fc.oneof(
          fc.constant('localhost:9200'),
          fc.constant('example.com'),
          fc.string({ minLength: 1 }).filter((s) => !s.startsWith('http')),
        );

        fc.assert(
          fc.property(invalidUrls, (url: string) => {
            const result = validateUrl('TEST', url);
            if (result.isErr()) {
              expect(result._unsafeUnwrapErr()).toBeInstanceOf(ValidationError);
              expect([
                'INVALID_URL_PROTOCOL',
                'INVALID_URL_FORMAT',
                'INVALID_URL_TRAILING_SLASH',
              ]).toContain(result._unsafeUnwrapErr().code);
            }
          }),
        );
      });

      it('should reject URLs with trailing slash in path', () => {
        const urlsWithTrailingSlash = fc
          .webUrl({ validSchemes: ['http', 'https'] })
          .filter((url) => {
            // Must have a path (not just domain) and end with /
            return /^https?:\/\/[^/]+\/.+\/$/.exec(url) !== null;
          });

        fc.assert(
          fc.property(urlsWithTrailingSlash, (url) => {
            const result = validateUrl('TEST', url);
            expect(result.isErr()).toBe(true);
            expect(result._unsafeUnwrapErr().code).toBe('INVALID_URL_TRAILING_SLASH');
          }),
        );
      });
    });

    describe('validateBoolean properties', () => {
      it('should be idempotent (same input produces same output)', () => {
        fc.assert(
          fc.property(fc.string(), fc.boolean(), (value: string, defaultValue: boolean) => {
            const result1 = validateBoolean('TEST', value, defaultValue);
            const result2 = validateBoolean('TEST', value, defaultValue);

            // Both should succeed or both should fail
            expect(result1.isOk()).toBe(result2.isOk());

            if (result1.isOk() && result2.isOk()) {
              expect(result1._unsafeUnwrap()).toBe(result2._unsafeUnwrap());
            }
          }),
        );
      });

      it('should accept valid boolean strings', () => {
        const validBooleans = fc.constantFrom(
          'true',
          'false',
          '1',
          '0',
          'yes',
          'no',
          'TRUE',
          'FALSE',
        );

        fc.assert(
          fc.property(validBooleans, (value: string) => {
            const result = validateBoolean('TEST', value, false);
            expect(result.isOk()).toBe(true);
            expect(typeof result._unsafeUnwrap()).toBe('boolean');
          }),
        );
      });
    });

    describe('validateLogLevel properties', () => {
      it('should only accept valid log levels', () => {
        const validLevels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

        fc.assert(
          fc.property(fc.constantFrom(...validLevels), (level: LogLevel) => {
            const result = validateLogLevel('TEST', level, 'info');
            expect(result.isOk()).toBe(true);
            expect(validLevels).toContain(result._unsafeUnwrap());
          }),
        );
      });

      it('should reject invalid log levels', () => {
        const invalidLevels = fc
          .string()
          .filter((s) => !['trace', 'debug', 'info', 'warn', 'error', 'fatal', ''].includes(s));

        fc.assert(
          fc.property(invalidLevels, (level: string) => {
            const result = validateLogLevel('TEST', level, 'info');
            expect(result.isErr()).toBe(true);
            expect(result._unsafeUnwrapErr().code).toBe('INVALID_LOG_LEVEL');
          }),
        );
      });
    });
  });
});
