import { existsSync } from "fs";
import { findEnvFile } from "./config";

/**
 * Configuration validation utilities
 * Provides helpful error messages for invalid/missing environment variables
 */

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly variable: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Get the location hint for where to set environment variables
 */
function getEnvFileHint(): string {
  const envFile = findEnvFile();
  if (envFile) {
    return `Set it in ${envFile}`;
  }
  return "Set it in ~/.shc2es/.env or create a local .env file";
}

/**
 * Validate that a required environment variable is set
 */
export function validateRequired(
  name: string,
  value: string | undefined,
): string {
  if (!value || value.trim() === "") {
    throw new ValidationError(
      `${name} is required. ${getEnvFileHint()}`,
      name,
    );
  }
  return value;
}

/**
 * Validate URL format
 * Checks for protocol, valid URL structure, and common mistakes
 */
export function validateUrl(
  name: string,
  value: string | undefined,
  options: { required: boolean } = { required: true },
): string | undefined {
  if (!value || value.trim() === "") {
    if (options.required) {
      throw new ValidationError(
        `${name} is required and must be a valid URL (e.g., https://localhost:9200). ${getEnvFileHint()}`,
        name,
      );
    }
    return undefined;
  }

  const trimmed = value.trim();

  // Check for protocol
  if (!trimmed.match(/^https?:\/\//)) {
    throw new ValidationError(
      `${name} must start with http:// or https:// (got: ${trimmed}). ${getEnvFileHint()}`,
      name,
    );
  }

  // Try to parse as URL
  try {
    new URL(trimmed);

    // Warn about trailing slashes (common mistake)
    // Note: We check the original trimmed string, not url.pathname
    // because URL parsing changes the path
    if (trimmed.endsWith("/") && !trimmed.match(/^https?:\/\/[^/]+\/$/)) {
      throw new ValidationError(
        `${name} should not have a trailing slash (got: ${trimmed}). ${getEnvFileHint()}`,
        name,
      );
    }

    return trimmed;
  } catch (err) {
    // If the error was our validation error, re-throw it
    if (err instanceof ValidationError) {
      throw err;
    }
    // Otherwise it's a URL parsing error
    throw new ValidationError(
      `${name} is not a valid URL (got: ${trimmed}). ${getEnvFileHint()}`,
      name,
    );
  }
}

/**
 * Validate file path exists
 */
export function validateFilePath(
  name: string,
  value: string | undefined,
  options: { required: boolean } = { required: false },
): string | undefined {
  if (!value || value.trim() === "") {
    if (options.required) {
      throw new ValidationError(
        `${name} is required. ${getEnvFileHint()}`,
        name,
      );
    }
    return undefined;
  }

  const trimmed = value.trim();

  if (!existsSync(trimmed)) {
    throw new ValidationError(
      `${name} file not found: ${trimmed}. ${getEnvFileHint()}`,
      name,
    );
  }

  return trimmed;
}

/**
 * Parse and validate boolean environment variable
 */
export function validateBoolean(
  name: string,
  value: string | undefined,
  defaultValue = false,
): boolean {
  if (!value || value.trim() === "") {
    return defaultValue;
  }

  const trimmed = value.trim().toLowerCase();

  if (trimmed === "true" || trimmed === "1" || trimmed === "yes") {
    return true;
  }

  if (trimmed === "false" || trimmed === "0" || trimmed === "no") {
    return false;
  }

  throw new ValidationError(
    `${name} must be 'true' or 'false' (got: ${value}). ${getEnvFileHint()}`,
    name,
  );
}

/**
 * Validate log level
 */
export function validateLogLevel(
  name: string,
  value: string | undefined,
  defaultValue = "info",
): string {
  if (!value || value.trim() === "") {
    return defaultValue;
  }

  const trimmed = value.trim().toLowerCase();
  const validLevels = ["trace", "debug", "info", "warn", "error", "fatal"];

  if (!validLevels.includes(trimmed)) {
    throw new ValidationError(
      `${name} must be one of: ${validLevels.join(", ")} (got: ${value}). ${getEnvFileHint()}`,
      name,
    );
  }

  return trimmed;
}

/**
 * Configuration schema for different commands
 */

export interface PollConfig {
  bshHost: string;
  bshPassword: string;
  bshClientName: string;
  bshClientId: string;
  logLevel: string;
}

export interface IngestConfig {
  esNode: string;
  esPassword: string;
  esUser: string;
  esCaCert?: string;
  esTlsVerify: boolean;
  esIndexPrefix: string;
  kibanaNode?: string;
}

export interface RegistryConfig {
  bshHost: string;
}

export interface DashboardConfig {
  kibanaNode: string;
  esPassword: string;
  esUser: string;
  esCaCert?: string;
  esTlsVerify: boolean;
}

/**
 * Validate configuration for poll command
 */
export function validatePollConfig(): PollConfig {
  return {
    bshHost: validateRequired("BSH_HOST", process.env.BSH_HOST),
    bshPassword: validateRequired("BSH_PASSWORD", process.env.BSH_PASSWORD),
    bshClientName:
      process.env.BSH_CLIENT_NAME ?? "oss_bosch_smart_home_poll",
    bshClientId:
      process.env.BSH_CLIENT_ID ?? "oss_bosch_smart_home_poll_client",
    logLevel: validateLogLevel("LOG_LEVEL", process.env.LOG_LEVEL, "info"),
  };
}

/**
 * Validate configuration for ingest command
 */
export function validateIngestConfig(options: {
  requireKibana?: boolean;
} = {}): IngestConfig {
  const esNode = validateUrl("ES_NODE", process.env.ES_NODE, {
    required: true,
  })!;
  const esPassword = validateRequired("ES_PASSWORD", process.env.ES_PASSWORD);
  const esCaCert = validateFilePath("ES_CA_CERT", process.env.ES_CA_CERT, {
    required: false,
  });
  const kibanaNode = options.requireKibana
    ? validateUrl("KIBANA_NODE", process.env.KIBANA_NODE, { required: true })!
    : validateUrl("KIBANA_NODE", process.env.KIBANA_NODE, { required: false });

  return {
    esNode,
    esPassword,
    esUser: process.env.ES_USER ?? "elastic",
    esCaCert,
    esTlsVerify: validateBoolean(
      "ES_TLS_VERIFY",
      process.env.ES_TLS_VERIFY,
      true,
    ),
    esIndexPrefix: process.env.ES_INDEX_PREFIX ?? "smart-home-events",
    kibanaNode,
  };
}

/**
 * Validate configuration for fetch-registry command
 */
export function validateRegistryConfig(): RegistryConfig {
  return {
    bshHost: validateRequired("BSH_HOST", process.env.BSH_HOST),
  };
}

/**
 * Validate configuration for export-dashboard command
 */
export function validateDashboardConfig(): DashboardConfig {
  const kibanaNode = validateUrl("KIBANA_NODE", process.env.KIBANA_NODE, {
    required: true,
  })!;
  const esPassword = validateRequired("ES_PASSWORD", process.env.ES_PASSWORD);
  const esCaCert = validateFilePath("ES_CA_CERT", process.env.ES_CA_CERT, {
    required: false,
  });

  return {
    kibanaNode,
    esPassword,
    esUser: process.env.ES_USER ?? "elastic",
    esCaCert,
    esTlsVerify: validateBoolean(
      "ES_TLS_VERIFY",
      process.env.ES_TLS_VERIFY,
      true,
    ),
  };
}
