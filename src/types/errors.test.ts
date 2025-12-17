/**
 * Unit tests for error types
 */

import * as fc from 'fast-check';
import { SHC2ESError, ValidationError, ConfigError, FileSystemError } from './errors';

describe('Error types', () => {
  describe('ValidationError', () => {
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

  describe('Property-based tests', () => {
    describe('ValidationError properties', () => {
      it('should preserve all constructor parameters', () => {
        fc.assert(
          fc.property(fc.string(), fc.string(), fc.string(), (message, variable, code) => {
            const error = new ValidationError(message, variable, code);

            expect(error.message).toBe(message);
            expect(error.variable).toBe(variable);
            expect(error.code).toBe(code);
            expect(error.name).toBe('ValidationError');
            expect(error).toBeInstanceOf(ValidationError);
            expect(error).toBeInstanceOf(SHC2ESError);
            expect(error).toBeInstanceOf(Error);
          }),
        );
      });

      it('should use default code when not provided', () => {
        fc.assert(
          fc.property(fc.string(), fc.string(), (message, variable) => {
            const error = new ValidationError(message, variable);
            expect(error.code).toBe('VALIDATION_ERROR');
          }),
        );
      });

      it('should preserve cause in error chain', () => {
        fc.assert(
          fc.property(
            fc.string(),
            fc.string(),
            fc.string(),
            fc.option(fc.anything()),
            (message, variable, code, cause) => {
              const error = new ValidationError(message, variable, code, cause);
              expect(error.cause).toBe(cause);
            },
          ),
        );
      });

      it('should always have stack trace', () => {
        fc.assert(
          fc.property(fc.string(), fc.string(), fc.string(), (message, variable, code) => {
            const error = new ValidationError(message, variable, code);
            expect(error.stack).toBeDefined();
            expect(typeof error.stack).toBe('string');
            expect(error.stack).toContain('ValidationError');
          }),
        );
      });
    });

    describe('ConfigError properties', () => {
      it('should preserve all constructor parameters', () => {
        fc.assert(
          fc.property(fc.string(), fc.option(fc.string()), fc.string(), (message, path, code) => {
            const error = new ConfigError(message, path, code);

            expect(error.message).toBe(message);
            expect(error.path).toBe(path);
            expect(error.code).toBe(code);
            expect(error.name).toBe('ConfigError');
            expect(error).toBeInstanceOf(ConfigError);
            expect(error).toBeInstanceOf(SHC2ESError);
            expect(error).toBeInstanceOf(Error);
          }),
        );
      });

      it('should use default code when not provided', () => {
        fc.assert(
          fc.property(fc.string(), fc.option(fc.string()), (message, path) => {
            const error = new ConfigError(message, path);
            expect(error.code).toBe('CONFIG_ERROR');
          }),
        );
      });

      it('should handle undefined path', () => {
        fc.assert(
          fc.property(fc.string(), fc.string(), (message, code) => {
            const error = new ConfigError(message, undefined, code);
            expect(error.path).toBeUndefined();
            expect(error.message).toBe(message);
          }),
        );
      });

      it('should preserve cause in error chain', () => {
        fc.assert(
          fc.property(
            fc.string(),
            fc.option(fc.string()),
            fc.string(),
            fc.option(fc.anything()),
            (message, path, code, cause) => {
              const error = new ConfigError(message, path, code, cause);
              expect(error.cause).toBe(cause);
            },
          ),
        );
      });
    });

    describe('FileSystemError properties', () => {
      it('should preserve all constructor parameters', () => {
        fc.assert(
          fc.property(fc.string(), fc.string(), fc.string(), (message, path, code) => {
            const error = new FileSystemError(message, path, code);

            expect(error.message).toBe(message);
            expect(error.path).toBe(path);
            expect(error.code).toBe(code);
            expect(error.name).toBe('FileSystemError');
            expect(error).toBeInstanceOf(FileSystemError);
            expect(error).toBeInstanceOf(SHC2ESError);
            expect(error).toBeInstanceOf(Error);
          }),
        );
      });

      it('should use default code when not provided', () => {
        fc.assert(
          fc.property(fc.string(), fc.string(), (message, path) => {
            const error = new FileSystemError(message, path);
            expect(error.code).toBe('FS_ERROR');
          }),
        );
      });

      it('should preserve cause in error chain', () => {
        fc.assert(
          fc.property(
            fc.string(),
            fc.string(),
            fc.string(),
            fc.option(fc.anything()),
            (message, path, code, cause) => {
              const error = new FileSystemError(message, path, code, cause);
              expect(error.cause).toBe(cause);
            },
          ),
        );
      });

      it('should handle paths with special characters', () => {
        const pathCharArbitrary = fc.constantFrom('/', '.', '-', '_', '~', 'a', 'b', '1', '2');
        const pathArbitrary = fc
          .array(pathCharArbitrary, { minLength: 1, maxLength: 50 })
          .map((chars) => chars.join(''));

        fc.assert(
          fc.property(fc.string(), pathArbitrary, fc.string(), (message, path, code) => {
            const error = new FileSystemError(message, path, code);
            expect(error.path).toBe(path);
          }),
        );
      });
    });

    describe('Error inheritance properties', () => {
      it('should maintain instanceof relationships for all error types', () => {
        fc.assert(
          fc.property(fc.string(), fc.string(), fc.string(), (message, param, code) => {
            const validationError = new ValidationError(message, param, code);
            const configError = new ConfigError(message, param, code);
            const fsError = new FileSystemError(message, param, code);

            const errors = [validationError, configError, fsError];

            errors.forEach((error) => {
              expect(error).toBeInstanceOf(SHC2ESError);
              expect(error).toBeInstanceOf(Error);
              expect(error.code).toBeDefined();
              expect(error.message).toBe(message);
            });
          }),
        );
      });

      it('should differentiate error types correctly', () => {
        fc.assert(
          fc.property(fc.string(), fc.string(), fc.string(), (message, param, code) => {
            const validationError = new ValidationError(message, param, code);
            const configError = new ConfigError(message, param, code);
            const fsError = new FileSystemError(message, param, code);

            // ValidationError checks
            expect(validationError).toBeInstanceOf(ValidationError);
            expect(validationError).not.toBeInstanceOf(ConfigError);
            expect(validationError).not.toBeInstanceOf(FileSystemError);

            // ConfigError checks
            expect(configError).toBeInstanceOf(ConfigError);
            expect(configError).not.toBeInstanceOf(ValidationError);
            expect(configError).not.toBeInstanceOf(FileSystemError);

            // FileSystemError checks
            expect(fsError).toBeInstanceOf(FileSystemError);
            expect(fsError).not.toBeInstanceOf(ValidationError);
            expect(fsError).not.toBeInstanceOf(ConfigError);
          }),
        );
      });

      it('should handle error chains with multiple causes', () => {
        fc.assert(
          fc.property(
            fc.string(),
            fc.string(),
            fc.string(),
            fc.string(),
            (msg1, msg2, msg3, path) => {
              const rootCause = new Error(msg1);
              const fsCause = new FileSystemError(msg2, path, 'WRITE_FAILED', rootCause);
              const configError = new ConfigError(msg3, path, 'SAVE_FAILED', fsCause);

              expect(configError.cause).toBe(fsCause);
              expect((configError.cause as FileSystemError).cause).toBe(rootCause);

              const fsCauseActual = configError.cause as FileSystemError;
              const rootCauseActual = fsCauseActual.cause;
              if (rootCauseActual) {
                expect(rootCauseActual).toBe(rootCause);
                expect(rootCauseActual.message).toBe(msg1);
              }
            },
          ),
        );
      });
    });
  });
});
