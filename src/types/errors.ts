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
    if (typeof Error.captureStackTrace === "function") {
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
 * new ValidationError(
 *   "BSH_HOST is required. Set it in ~/.shc2es/.env",
 *   "BSH_HOST",
 *   "MISSING_REQUIRED"
 * )
 * ```
 */
export class ValidationError extends SHC2ESError {
  readonly code: string;
  readonly variable: string;

  constructor(
    message: string,
    variable: string,
    code = "VALIDATION_ERROR",
    cause?: Error,
  ) {
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
 * new ConfigError(
 *   "Failed to create config directory: /Users/user/.shc2es",
 *   "/Users/user/.shc2es",
 *   "DIR_CREATE_FAILED",
 *   err
 * )
 * ```
 */
export class ConfigError extends SHC2ESError {
  readonly code: string;
  readonly path?: string;

  constructor(
    message: string,
    path: string | undefined,
    code = "CONFIG_ERROR",
    cause?: Error,
  ) {
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
 * new FileSystemError(
 *   "Failed to read device registry: /Users/user/.shc2es/data/device-registry.json",
 *   "/Users/user/.shc2es/data/device-registry.json",
 *   "FILE_READ_FAILED",
 *   err
 * )
 * ```
 */
export class FileSystemError extends SHC2ESError {
  readonly code: string;
  readonly path: string;

  constructor(message: string, path: string, code = "FS_ERROR", cause?: Error) {
    super(message, cause);
    this.path = path;
    this.code = code;
  }
}
