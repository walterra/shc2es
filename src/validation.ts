import { existsSync } from 'fs';
import type { Result } from 'neverthrow';
import { ok, err } from 'neverthrow';
import { findEnvFile } from './config';
import { ValidationError } from './types/errors';

/**
 * Configuration validation utilities
 * Provides helpful error messages for invalid/missing environment variables
 */

/**
 * Gets the location hint for where to set environment variables.
 *
 * @returns Hint message about where to set environment variables
 */
function getEnvFileHint(): string {
  const envFile = findEnvFile();
  if (envFile) {
    return `Set it in ${envFile}`;
  }
  return 'Set it in ~/.shc2es/.env or create a local .env file';
}

/**
 * Validates required environment variable is set.
 *
 * @param name - Environment variable name
 * @param value - Environment variable value
 * @returns Result containing the validated value or a ValidationError
 *
 * @example
 * ```typescript
 * const result = validateRequired("BSH_HOST", process.env.BSH_HOST);
 * if (result.isOk()) {
 *   console.log("Host:", result.value);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */
export function validateRequired(
  name: string,
  value: string | undefined,
): Result<string, ValidationError> {
  if (!value || value.trim() === '') {
    return err(
      new ValidationError(`${name} is required. ${getEnvFileHint()}`, name, 'MISSING_REQUIRED'),
    );
  }
  return ok(value);
}

/**
 * Validates URL format.
 *
 * Checks protocol, URL structure, and trailing slashes.
 *
 * @param name - Environment variable name
 * @param value - URL value to validate
 * @param options - Validation options
 * @param options.required - Whether the URL is required (default: true)
 * @returns Result containing the validated URL or undefined (if not required), or a ValidationError
 *
 * @example
 * ```typescript
 * const result = validateUrl("ES_NODE", process.env.ES_NODE, { required: true });
 * result.match(
 *   (url) => console.log("Valid URL:", url),
 *   (error) => console.error(error.message)
 * );
 * ```
 */
export function validateUrl(
  name: string,
  value: string | undefined,
  options: { required: boolean } = { required: true },
): Result<string | undefined, ValidationError> {
  if (!value || value.trim() === '') {
    if (options.required) {
      return err(
        new ValidationError(
          `${name} is required and must be a valid URL (e.g., https://localhost:9200). ${getEnvFileHint()}`,
          name,
          'MISSING_REQUIRED',
        ),
      );
    }
    return ok(undefined);
  }

  const trimmed = value.trim();

  // Check for protocol
  const protocolRegex = /^https?:\/\//;
  if (!protocolRegex.exec(trimmed)) {
    return err(
      new ValidationError(
        `${name} must start with http:// or https:// (got: ${trimmed}). ${getEnvFileHint()}`,
        name,
        'INVALID_URL_PROTOCOL',
      ),
    );
  }

  // Try to parse as URL
  try {
    new URL(trimmed);

    // Warn about trailing slashes (common mistake)
    // Note: We check the original trimmed string, not url.pathname
    // because URL parsing changes the path
    const trailingSlashRegex = /^https?:\/\/[^/]+\/$/;
    if (trimmed.endsWith('/') && !trailingSlashRegex.exec(trimmed)) {
      return err(
        new ValidationError(
          `${name} should not have a trailing slash (got: ${trimmed}). ${getEnvFileHint()}`,
          name,
          'INVALID_URL_TRAILING_SLASH',
        ),
      );
    }

    return ok(trimmed);
  } catch (parseErr) {
    return err(
      new ValidationError(
        `${name} is not a valid URL (got: ${trimmed}). ${getEnvFileHint()}`,
        name,
        'INVALID_URL_FORMAT',
        parseErr instanceof Error ? parseErr : undefined,
      ),
    );
  }
}

/**
 * Validates file path existence.
 *
 * @param name - Environment variable name
 * @param value - File path to validate
 * @param options - Validation options
 * @param options.required - Whether the file path is required (default: false)
 * @returns Result containing the validated path or undefined (if not required), or a ValidationError
 *
 * @example
 * ```typescript
 * const result = validateFilePath("ES_CA_CERT", process.env.ES_CA_CERT, { required: false });
 * if (result.isOk()) {
 *   const path = result.value; // string | undefined
 * }
 * ```
 */
export function validateFilePath(
  name: string,
  value: string | undefined,
  options: { required: boolean } = { required: false },
): Result<string | undefined, ValidationError> {
  if (!value || value.trim() === '') {
    if (options.required) {
      return err(
        new ValidationError(`${name} is required. ${getEnvFileHint()}`, name, 'MISSING_REQUIRED'),
      );
    }
    return ok(undefined);
  }

  const trimmed = value.trim();

  if (!existsSync(trimmed)) {
    return err(
      new ValidationError(
        `${name} file not found: ${trimmed}. ${getEnvFileHint()}`,
        name,
        'FILE_NOT_FOUND',
      ),
    );
  }

  return ok(trimmed);
}

/**
 * Parses and validates boolean environment variable.
 *
 * Accepts: 'true', '1', 'yes' for true; 'false', '0', 'no' for false (case-insensitive)
 *
 * @param name - Environment variable name
 * @param value - Value to parse
 * @param defaultValue - Default value if not set (default: false)
 * @returns Result containing the boolean value or a ValidationError
 *
 * @example
 * ```typescript
 * const result = validateBoolean("ES_TLS_VERIFY", process.env.ES_TLS_VERIFY, true);
 * const verify = result.unwrapOr(true); // Use default on error
 * ```
 */
export function validateBoolean(
  name: string,
  value: string | undefined,
  defaultValue = false,
): Result<boolean, ValidationError> {
  if (!value || value.trim() === '') {
    return ok(defaultValue);
  }

  const trimmed = value.trim().toLowerCase();

  if (trimmed === 'true' || trimmed === '1' || trimmed === 'yes') {
    return ok(true);
  }

  if (trimmed === 'false' || trimmed === '0' || trimmed === 'no') {
    return ok(false);
  }

  return err(
    new ValidationError(
      `${name} must be 'true' or 'false' (got: ${value}). ${getEnvFileHint()}`,
      name,
      'INVALID_BOOLEAN',
    ),
  );
}

/**
 * Log level type
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Validates log level.
 *
 * @param name - Environment variable name
 * @param value - Log level value
 * @param defaultValue - Default log level (default: "info")
 * @returns Result containing the validated log level or a ValidationError
 *
 * @example
 * ```typescript
 * const result = validateLogLevel("LOG_LEVEL", process.env.LOG_LEVEL, "info");
 * const level = result.unwrapOr("info");
 * ```
 */
export function validateLogLevel(
  name: string,
  value: string | undefined,
  defaultValue: LogLevel = 'info',
): Result<LogLevel, ValidationError> {
  if (!value || value.trim() === '') {
    return ok(defaultValue);
  }

  const trimmed = value.trim().toLowerCase();
  const validLevels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

  if (!validLevels.includes(trimmed as LogLevel)) {
    return err(
      new ValidationError(
        `${name} must be one of: ${validLevels.join(', ')} (got: ${value}). ${getEnvFileHint()}`,
        name,
        'INVALID_LOG_LEVEL',
      ),
    );
  }

  return ok(trimmed as LogLevel);
}

/**
 * Configuration for the poll command.
 *
 * Contains all settings needed to connect to and poll the Bosch Smart Home Controller.
 */
export interface PollConfig {
  /** Smart Home Controller IP address or hostname */
  bshHost: string;
  /** System password for controller authentication */
  bshPassword: string;
  /** Client name for identification (default: 'oss_bosch_smart_home_poll') */
  bshClientName: string;
  /** Client ID for identification (default: 'oss_bosch_smart_home_poll_client') */
  bshClientId: string;
  /** Log level for application logging */
  logLevel: LogLevel;
}

/**
 * Configuration for the ingest command.
 *
 * Contains all settings needed to connect to Elasticsearch and optionally Kibana
 * for data ingestion and dashboard setup.
 */
export interface IngestConfig {
  /** Elasticsearch node URL (e.g., 'https://localhost:9200') */
  esNode: string;
  /** Elasticsearch password for authentication */
  esPassword: string;
  /** Elasticsearch username (default: 'elastic') */
  esUser: string;
  /** Optional path to CA certificate for TLS verification */
  esCaCert?: string;
  /** Whether to verify TLS certificates (default: true, disable only for dev) */
  esTlsVerify: boolean;
  /** Index name prefix (default: 'smart-home-events') */
  esIndexPrefix: string;
  /** Optional Kibana node URL (required for dashboard import) */
  kibanaNode?: string;
}

/**
 * Configuration for the registry command.
 *
 * Contains settings needed to fetch device and room metadata from the controller.
 */
export interface RegistryConfig {
  /** Smart Home Controller IP address or hostname */
  bshHost: string;
}

/**
 * Configuration for the dashboard export command.
 *
 * Contains settings needed to connect to Kibana for exporting dashboards.
 */
export interface DashboardConfig {
  /** Kibana node URL (e.g., 'https://localhost:5601') */
  kibanaNode: string;
  /** Elasticsearch password for Kibana authentication */
  esPassword: string;
  /** Elasticsearch username (default: 'elastic') */
  esUser: string;
  /** Optional path to CA certificate for TLS verification */
  esCaCert?: string;
  /** Whether to verify TLS certificates (default: true, disable only for dev) */
  esTlsVerify: boolean;
}

/**
 * Validates poll command configuration.
 *
 * @returns Result containing PollConfig or a ValidationError
 *
 * @example
 * ```typescript
 * const result = validatePollConfig();
 * if (result.isErr()) {
 *   console.error(result.error.message);
 *   process.exit(1);
 * }
 * const config = result.value;
 * ```
 */
export function validatePollConfig(): Result<PollConfig, ValidationError> {
  const bshHostResult = validateRequired('BSH_HOST', process.env.BSH_HOST);
  const bshPasswordResult = validateRequired('BSH_PASSWORD', process.env.BSH_PASSWORD);
  const logLevelResult = validateLogLevel('LOG_LEVEL', process.env.LOG_LEVEL, 'info');

  // Combine all results - fail on first error
  return bshHostResult.andThen((bshHost) =>
    bshPasswordResult.andThen((bshPassword) =>
      logLevelResult.map((logLevel) => ({
        bshHost,
        bshPassword,
        bshClientName: process.env.BSH_CLIENT_NAME ?? 'oss_bosch_smart_home_poll',
        bshClientId: process.env.BSH_CLIENT_ID ?? 'oss_bosch_smart_home_poll_client',
        logLevel,
      })),
    ),
  );
}

/**
 * Validates ingest command configuration.
 *
 * @param options - Validation options
 * @param options.requireKibana - Whether Kibana node is required (default: undefined)
 * @returns Result containing IngestConfig or a ValidationError
 *
 * @example
 * ```typescript
 * const result = validateIngestConfig({ requireKibana: true });
 * result.match(
 *   (config) => startIngestion(config),
 *   (error) => {
 *     console.error(error.message);
 *     process.exit(1);
 *   }
 * );
 * ```
 */
export function validateIngestConfig(
  options: {
    requireKibana?: boolean;
  } = {},
): Result<IngestConfig, ValidationError> {
  const esNodeResult = validateUrl('ES_NODE', process.env.ES_NODE, {
    required: true,
  });
  const esPasswordResult = validateRequired('ES_PASSWORD', process.env.ES_PASSWORD);
  const esCaCertResult = validateFilePath('ES_CA_CERT', process.env.ES_CA_CERT, {
    required: false,
  });
  const esTlsVerifyResult = validateBoolean('ES_TLS_VERIFY', process.env.ES_TLS_VERIFY, true);

  const kibanaNodeResult = validateUrl('KIBANA_NODE', process.env.KIBANA_NODE, {
    required: !!options.requireKibana,
  });

  // Combine all results - fail on first error
  // Flatten nested callbacks to reduce complexity
  const step1 = esNodeResult.andThen((esNode) =>
    esPasswordResult.map((esPassword) => ({ esNode, esPassword })),
  );

  const step2 = step1.andThen(({ esNode, esPassword }) =>
    esCaCertResult.map((esCaCert) => ({ esNode, esPassword, esCaCert })),
  );

  const step3 = step2.andThen(({ esNode, esPassword, esCaCert }) =>
    esTlsVerifyResult.map((esTlsVerify) => ({ esNode, esPassword, esCaCert, esTlsVerify })),
  );

  return step3.andThen(({ esNode, esPassword, esCaCert, esTlsVerify }) =>
    kibanaNodeResult.map((kibanaNode) => ({
      // esNode is guaranteed to be string (not undefined) because required=true
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      esNode: esNode!,
      esPassword,
      esUser: process.env.ES_USER ?? 'elastic',
      esCaCert,
      esTlsVerify,
      esIndexPrefix: process.env.ES_INDEX_PREFIX ?? 'smart-home-events',
      kibanaNode,
    })),
  );
}

/**
 * Validates registry command configuration.
 *
 * @returns Result containing RegistryConfig or a ValidationError
 *
 * @example
 * ```typescript
 * const result = validateRegistryConfig();
 * if (result.isErr()) {
 *   console.error(result.error.message);
 *   process.exit(1);
 * }
 * const config = result.value;
 * ```
 */
export function validateRegistryConfig(): Result<RegistryConfig, ValidationError> {
  return validateRequired('BSH_HOST', process.env.BSH_HOST).map((bshHost) => ({
    bshHost,
  }));
}

/**
 * Validates dashboard export configuration.
 *
 * @returns Result containing DashboardConfig or a ValidationError
 *
 * @example
 * ```typescript
 * const result = validateDashboardConfig();
 * result.match(
 *   (config) => exportDashboard(config),
 *   (error) => {
 *     console.error(error.message);
 *     process.exit(1);
 *   }
 * );
 * ```
 */
export function validateDashboardConfig(): Result<DashboardConfig, ValidationError> {
  const kibanaNodeResult = validateUrl('KIBANA_NODE', process.env.KIBANA_NODE, {
    required: true,
  });
  const esPasswordResult = validateRequired('ES_PASSWORD', process.env.ES_PASSWORD);
  const esCaCertResult = validateFilePath('ES_CA_CERT', process.env.ES_CA_CERT, {
    required: false,
  });
  const esTlsVerifyResult = validateBoolean('ES_TLS_VERIFY', process.env.ES_TLS_VERIFY, true);

  // Combine all results - fail on first error
  return kibanaNodeResult.andThen((kibanaNode) =>
    esPasswordResult.andThen((esPassword) =>
      esCaCertResult.andThen((esCaCert) =>
        esTlsVerifyResult.map((esTlsVerify) => ({
          // kibanaNode is guaranteed to be string (not undefined) because required=true
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          kibanaNode: kibanaNode!,
          esPassword,
          esUser: process.env.ES_USER ?? 'elastic',
          esCaCert,
          esTlsVerify,
        })),
      ),
    ),
  );
}
