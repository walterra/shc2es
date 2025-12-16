/**
 * Custom error types for the shc2es application.
 *
 * These error classes provide structured error information with error codes
 * for programmatic handling and optional cause chaining.
 */

/**
 * Base error class for all shc2es errors.
 */
export abstract class SHC2ESError extends Error {
  /**
   * Error code for programmatic handling
   */
  abstract readonly code: string;

  /**
   * Optional underlying cause of this error
   */
  readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    this.cause = cause;

    // Maintains proper stack trace for where our error was thrown (V8-specific)
    // Note: Error.captureStackTrace is defined in @types/node but not standard JavaScript
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Validation error for environment variables and configuration.
 *
 * Thrown when:
 * - Required environment variable is missing
 * - Environment variable has invalid format (e.g., invalid URL)
 * - Configuration value is out of valid range
 *
 * @example
 * ```typescript
 * import { ValidationError } from './types/errors';
 *
 * // Missing required variable
 * throw new ValidationError(
 *   "BSH_HOST is required. Set it in ~/.shc2es/.env",
 *   "BSH_HOST",
 *   "MISSING_REQUIRED"
 * );
 *
 * // Invalid URL format
 * throw new ValidationError(
 *   "ES_NODE must start with http:// or https:// (got: localhost:9200). Set it in ~/.shc2es/.env",
 *   "ES_NODE",
 *   "INVALID_URL_PROTOCOL"
 * );
 *
 * // Catch and handle validation errors
 * try {
 *   validateConfig();
 * } catch (err) {
 *   if (err instanceof ValidationError) {
 *     console.error(`Configuration error: ${err.message}`);
 *     console.error(`Variable: ${err.variable}`);
 *     console.error(`Error code: ${err.code}`);
 *   }
 * }
 * ```
 */
export class ValidationError extends SHC2ESError {
  readonly code: string;
  readonly variable: string;

  constructor(message: string, variable: string, code = 'VALIDATION_ERROR', cause?: Error) {
    super(message, cause);
    this.variable = variable;
    this.code = code;
  }
}

/**
 * Configuration error for file system operations.
 *
 * Thrown when:
 * - Cannot create configuration directories
 * - Cannot read/write configuration files
 * - Configuration file is malformed
 *
 * @example
 * ```typescript
 * import { ConfigError } from './types/errors';
 * import { mkdir } from 'fs/promises';
 *
 * // Creating configuration directory
 * try {
 *   await mkdir('/Users/user/.shc2es', { recursive: true });
 * } catch (err) {
 *   throw new ConfigError(
 *     "Failed to create config directory: /Users/user/.shc2es",
 *     "/Users/user/.shc2es",
 *     "DIR_CREATE_FAILED",
 *     err instanceof Error ? err : undefined
 *   );
 * }
 *
 * // Reading configuration file
 * try {
 *   const config = JSON.parse(await readFile('.env', 'utf-8'));
 * } catch (err) {
 *   throw new ConfigError(
 *     "Configuration file is malformed: .env",
 *     ".env",
 *     "MALFORMED_CONFIG",
 *     err instanceof Error ? err : undefined
 *   );
 * }
 *
 * // Handling config errors
 * try {
 *   loadConfig();
 * } catch (err) {
 *   if (err instanceof ConfigError) {
 *     console.error(`Config error at ${err.path}: ${err.message}`);
 *     if (err.cause) {
 *       console.error('Caused by:', err.cause);
 *     }
 *   }
 * }
 * ```
 */
export class ConfigError extends SHC2ESError {
  readonly code: string;
  readonly path?: string;

  constructor(message: string, path: string | undefined, code = 'CONFIG_ERROR', cause?: Error) {
    super(message, cause);
    this.path = path;
    this.code = code;
  }
}

/**
 * File system error for general I/O operations.
 *
 * Thrown when:
 * - File read/write fails
 * - Directory operations fail
 * - Permission denied
 *
 * @example
 * ```typescript
 * import { FileSystemError } from './types/errors';
 * import { readFile, writeFile } from 'fs/promises';
 *
 * // Reading a file
 * try {
 *   const data = await readFile('/Users/user/.shc2es/data/device-registry.json', 'utf-8');
 *   return JSON.parse(data);
 * } catch (err) {
 *   throw new FileSystemError(
 *     "Failed to read device registry: /Users/user/.shc2es/data/device-registry.json",
 *     "/Users/user/.shc2es/data/device-registry.json",
 *     "FILE_READ_FAILED",
 *     err instanceof Error ? err : undefined
 *   );
 * }
 *
 * // Writing a file
 * try {
 *   await writeFile('/var/logs/app.log', logData);
 * } catch (err) {
 *   if ((err as NodeJS.ErrnoException).code === 'EACCES') {
 *     throw new FileSystemError(
 *       "Permission denied writing to: /var/logs/app.log",
 *       "/var/logs/app.log",
 *       "PERMISSION_DENIED",
 *       err instanceof Error ? err : undefined
 *     );
 *   }
 *   throw err;
 * }
 *
 * // Handling file system errors
 * try {
 *   loadData();
 * } catch (err) {
 *   if (err instanceof FileSystemError) {
 *     console.error(`File system error at ${err.path}: ${err.message}`);
 *     console.error(`Error code: ${err.code}`);
 *   }
 * }
 * ```
 */
export class FileSystemError extends SHC2ESError {
  readonly code: string;
  readonly path: string;

  constructor(message: string, path: string, code = 'FS_ERROR', cause?: Error) {
    super(message, cause);
    this.path = path;
    this.code = code;
  }
}
