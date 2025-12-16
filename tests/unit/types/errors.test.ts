/**
 * Unit tests for error types
 */

import {
  SHC2ESError,
  ValidationError,
  ConfigError,
  FileSystemError,
} from '../../../src/types/errors';

describe('Error types', () => {
  describe('SHC2ESError', () => {
    // SHC2ESError is abstract, so we test via subclass
    it('should be instance of Error', () => {
      const error = new ValidationError('test', 'TEST_VAR', 'TEST_CODE');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SHC2ESError);
    });

    it('should set name from constructor', () => {
      const error = new ValidationError('test', 'TEST_VAR', 'TEST_CODE');
      expect(error.name).toBe('ValidationError');
    });

    it('should include cause when provided', () => {
      const cause = new Error('Original error');
      const error = new ValidationError('test', 'TEST_VAR', 'TEST_CODE', cause);
      expect(error.cause).toBe(cause);
    });

    it('should have undefined cause when not provided', () => {
      const error = new ValidationError('test', 'TEST_VAR', 'TEST_CODE');
      expect(error.cause).toBeUndefined();
    });

    it('should have stack trace', () => {
      const error = new ValidationError('test', 'TEST_VAR', 'TEST_CODE');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError');
    });
  });

  describe('ValidationError', () => {
    it('should create error with all required fields', () => {
      const error = new ValidationError('Test validation message', 'TEST_VAR', 'TEST_CODE');

      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(SHC2ESError);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test validation message');
      expect(error.variable).toBe('TEST_VAR');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('ValidationError');
    });

    it('should use default code when not provided', () => {
      const error = new ValidationError('test', 'TEST_VAR');
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should include cause in chain', () => {
      const cause = new Error('Root cause');
      const error = new ValidationError('Validation failed', 'TEST_VAR', 'INVALID_VALUE', cause);

      expect(error.cause).toBe(cause);
      expect((error.cause as Error).message).toBe('Root cause');
    });

    it('should be catchable as Error', () => {
      expect(() => {
        throw new ValidationError('test', 'TEST_VAR', 'TEST_CODE');
      }).toThrow(Error);
    });

    it('should be catchable as ValidationError', () => {
      expect(() => {
        throw new ValidationError('test', 'TEST_VAR', 'TEST_CODE');
      }).toThrow(ValidationError);
    });

    it('should preserve message in error chain', () => {
      try {
        throw new ValidationError('Invalid value', 'TEST_VAR', 'INVALID_FORMAT');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).message).toBe('Invalid value');
        expect((err as ValidationError).variable).toBe('TEST_VAR');
        expect((err as ValidationError).code).toBe('INVALID_FORMAT');
      }
    });
  });

  describe('ConfigError', () => {
    it('should create error with all required fields', () => {
      const error = new ConfigError('Config file not found', '/path/to/.env', 'CONFIG_NOT_FOUND');

      expect(error).toBeInstanceOf(ConfigError);
      expect(error).toBeInstanceOf(SHC2ESError);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Config file not found');
      expect(error.path).toBe('/path/to/.env');
      expect(error.code).toBe('CONFIG_NOT_FOUND');
      expect(error.name).toBe('ConfigError');
    });

    it('should use default code when not provided', () => {
      const error = new ConfigError('test', '/path');
      expect(error.code).toBe('CONFIG_ERROR');
    });

    it('should allow undefined path', () => {
      const error = new ConfigError('test', undefined, 'TEST_CODE');
      expect(error.path).toBeUndefined();
    });

    it('should include cause in chain', () => {
      const cause = new Error('ENOENT: no such file or directory');
      const error = new ConfigError(
        'Failed to read config',
        '/path/to/.env',
        'CONFIG_READ_FAILED',
        cause,
      );

      expect(error.cause).toBe(cause);
      expect((error.cause as Error).message).toContain('ENOENT');
    });

    it('should be catchable as ConfigError', () => {
      expect(() => {
        throw new ConfigError('test', '/path', 'TEST_CODE');
      }).toThrow(ConfigError);
    });

    it('should preserve path in error', () => {
      try {
        throw new ConfigError('Permission denied', '/root/.shc2es/.env', 'PERMISSION_DENIED');
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        expect((err as ConfigError).path).toBe('/root/.shc2es/.env');
        expect((err as ConfigError).code).toBe('PERMISSION_DENIED');
      }
    });
  });

  describe('FileSystemError', () => {
    it('should create error with all required fields', () => {
      const error = new FileSystemError(
        'Failed to read file',
        '/path/to/file.json',
        'FILE_READ_FAILED',
      );

      expect(error).toBeInstanceOf(FileSystemError);
      expect(error).toBeInstanceOf(SHC2ESError);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Failed to read file');
      expect(error.path).toBe('/path/to/file.json');
      expect(error.code).toBe('FILE_READ_FAILED');
      expect(error.name).toBe('FileSystemError');
    });

    it('should use default code when not provided', () => {
      const error = new FileSystemError('test', '/path');
      expect(error.code).toBe('FS_ERROR');
    });

    it('should include cause in chain', () => {
      const cause = new Error('EACCES: permission denied');
      const error = new FileSystemError(
        'Cannot write to file',
        '/var/log/app.log',
        'FILE_WRITE_FAILED',
        cause,
      );

      expect(error.cause).toBe(cause);
      expect((error.cause as Error).message).toContain('EACCES');
    });

    it('should be catchable as FileSystemError', () => {
      expect(() => {
        throw new FileSystemError('test', '/path', 'TEST_CODE');
      }).toThrow(FileSystemError);
    });

    it('should preserve path in error', () => {
      try {
        throw new FileSystemError('File not found', '/data/registry.json', 'FILE_NOT_FOUND');
      } catch (err) {
        expect(err).toBeInstanceOf(FileSystemError);
        expect((err as FileSystemError).path).toBe('/data/registry.json');
        expect((err as FileSystemError).code).toBe('FILE_NOT_FOUND');
      }
    });

    it('should handle path with special characters', () => {
      const specialPath = '/Users/user/.shc2es/logs/poll-2025-12-15.log';
      const error = new FileSystemError('Failed to write', specialPath, 'WRITE_ERROR');

      expect(error.path).toBe(specialPath);
    });
  });

  describe('Error inheritance and polymorphism', () => {
    it('should allow catching base class', () => {
      const errors: SHC2ESError[] = [
        new ValidationError('test1', 'VAR1', 'CODE1'),
        new ConfigError('test2', '/path', 'CODE2'),
        new FileSystemError('test3', '/file', 'CODE3'),
      ];

      errors.forEach((error) => {
        expect(error).toBeInstanceOf(SHC2ESError);
        expect(error).toBeInstanceOf(Error);
        expect(error.code).toBeDefined();
      });
    });

    it('should differentiate error types', () => {
      const validationError = new ValidationError('test', 'VAR', 'CODE');
      const configError = new ConfigError('test', '/path', 'CODE');
      const fsError = new FileSystemError('test', '/file', 'CODE');

      expect(validationError).toBeInstanceOf(ValidationError);
      expect(validationError).not.toBeInstanceOf(ConfigError);
      expect(validationError).not.toBeInstanceOf(FileSystemError);

      expect(configError).toBeInstanceOf(ConfigError);
      expect(configError).not.toBeInstanceOf(ValidationError);
      expect(configError).not.toBeInstanceOf(FileSystemError);

      expect(fsError).toBeInstanceOf(FileSystemError);
      expect(fsError).not.toBeInstanceOf(ValidationError);
      expect(fsError).not.toBeInstanceOf(ConfigError);
    });

    it('should handle error chain with causes', () => {
      const rootCause = new Error('Network timeout');
      const fsCause = new FileSystemError(
        'Failed to save',
        '/tmp/data.json',
        'WRITE_FAILED',
        rootCause,
      );
      const configError = new ConfigError(
        'Config persistence failed',
        '/tmp/config',
        'SAVE_FAILED',
        fsCause,
      );

      expect(configError.cause).toBe(fsCause);
      expect((configError.cause as FileSystemError).cause).toBe(rootCause);
      expect(((configError.cause as FileSystemError).cause as Error).message).toBe(
        'Network timeout',
      );
    });
  });

  describe('Error serialization', () => {
    it('should serialize ValidationError properties', () => {
      const error = new ValidationError('Invalid input', 'USERNAME', 'INVALID_FORMAT');

      const serialized = {
        name: error.name,
        message: error.message,
        code: error.code,
        variable: error.variable,
      };

      expect(serialized).toEqual({
        name: 'ValidationError',
        message: 'Invalid input',
        code: 'INVALID_FORMAT',
        variable: 'USERNAME',
      });
    });

    it('should serialize ConfigError properties', () => {
      const error = new ConfigError('Config corrupted', '/etc/app.conf', 'CORRUPTED');

      const serialized = {
        name: error.name,
        message: error.message,
        code: error.code,
        path: error.path,
      };

      expect(serialized).toEqual({
        name: 'ConfigError',
        message: 'Config corrupted',
        code: 'CORRUPTED',
        path: '/etc/app.conf',
      });
    });

    it('should serialize FileSystemError properties', () => {
      const error = new FileSystemError('Disk full', '/var/data', 'DISK_FULL');

      const serialized = {
        name: error.name,
        message: error.message,
        code: error.code,
        path: error.path,
      };

      expect(serialized).toEqual({
        name: 'FileSystemError',
        message: 'Disk full',
        code: 'DISK_FULL',
        path: '/var/data',
      });
    });
  });
});
