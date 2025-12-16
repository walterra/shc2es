/**
 * Unit tests for validation module
 */

import * as fs from 'fs';
import * as path from 'path';
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
    it('should return Ok with value when set', () => {
      const result = validateRequired('TEST', 'value');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('value');
    });

    it('should return Err when undefined', () => {
      const result = validateRequired('TEST', undefined);
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toMatch(/TEST is required/);
      expect(error.code).toBe('MISSING_REQUIRED');
    });

    it('should return Err when empty string', () => {
      const result1 = validateRequired('TEST', '');
      expect(result1.isErr()).toBe(true);

      const result2 = validateRequired('TEST', '   ');
      expect(result2.isErr()).toBe(true);
    });

    it('should include env file hint in error message', () => {
      const result = validateRequired('TEST', undefined);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/Set it in/);
    });
  });

  describe('validateUrl', () => {
    it('should validate valid HTTP URLs', () => {
      const result = validateUrl('TEST', 'http://localhost:9200');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('http://localhost:9200');
    });

    it('should validate valid HTTPS URLs', () => {
      const result = validateUrl('TEST', 'https://example.com:443');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('https://example.com:443');
    });

    it('should trim whitespace', () => {
      const result = validateUrl('TEST', '  https://example.com  ');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('https://example.com');
    });

    it('should return Err when missing protocol', () => {
      const result = validateUrl('TEST', 'localhost:9200');
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toMatch(/must start with http/);
      expect(error.code).toBe('INVALID_URL_PROTOCOL');
    });

    it('should return Err when invalid URL', () => {
      const result = validateUrl('TEST', 'http://');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('INVALID_URL_FORMAT');
    });

    it('should return Err when trailing slash in path', () => {
      const result = validateUrl('TEST', 'http://localhost:9200/path/');
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.message).toMatch(/trailing slash/);
      expect(error.code).toBe('INVALID_URL_TRAILING_SLASH');
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
    it("should parse 'true' as true", () => {
      expect(validateBoolean('TEST', 'true')._unsafeUnwrap()).toBe(true);
      expect(validateBoolean('TEST', 'TRUE')._unsafeUnwrap()).toBe(true);
      expect(validateBoolean('TEST', '  true  ')._unsafeUnwrap()).toBe(true);
    });

    it("should parse '1' and 'yes' as true", () => {
      expect(validateBoolean('TEST', '1')._unsafeUnwrap()).toBe(true);
      expect(validateBoolean('TEST', 'yes')._unsafeUnwrap()).toBe(true);
    });

    it("should parse 'false' as false", () => {
      expect(validateBoolean('TEST', 'false')._unsafeUnwrap()).toBe(false);
      expect(validateBoolean('TEST', 'FALSE')._unsafeUnwrap()).toBe(false);
      expect(validateBoolean('TEST', '  false  ')._unsafeUnwrap()).toBe(false);
    });

    it("should parse '0' and 'no' as false", () => {
      expect(validateBoolean('TEST', '0')._unsafeUnwrap()).toBe(false);
      expect(validateBoolean('TEST', 'no')._unsafeUnwrap()).toBe(false);
    });

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
    it('should validate valid log levels', () => {
      expect(validateLogLevel('TEST', 'debug')._unsafeUnwrap()).toBe('debug');
      expect(validateLogLevel('TEST', 'info')._unsafeUnwrap()).toBe('info');
      expect(validateLogLevel('TEST', 'warn')._unsafeUnwrap()).toBe('warn');
      expect(validateLogLevel('TEST', 'error')._unsafeUnwrap()).toBe('error');
      expect(validateLogLevel('TEST', 'fatal')._unsafeUnwrap()).toBe('fatal');
      expect(validateLogLevel('TEST', 'trace')._unsafeUnwrap()).toBe('trace');
    });

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

    it('should return Err on invalid level', () => {
      const result = validateLogLevel('TEST', 'invalid');
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.message).toMatch(/must be one of/);
      expect(error.code).toBe('INVALID_LOG_LEVEL');
    });
  });

  describe('validatePollConfig', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      // Mock console.error for error tests
      jest.spyOn(console, 'error').mockImplementation(() => {});
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
      jest.spyOn(console, 'error').mockImplementation(() => {});
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
      jest.spyOn(console, 'error').mockImplementation(() => {});
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
      jest.spyOn(console, 'error').mockImplementation(() => {});
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
});
