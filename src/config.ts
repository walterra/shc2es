import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';

/**
 * Get user configuration directory path.
 *
 * All application data, logs, and configuration files are stored under this directory
 * to keep user data separate from the application installation.
 *
 * @returns Path to user config directory
 *
 * @example
 * ```typescript
 * import { getUserConfigDir } from './config';
 * console.log(getUserConfigDir()); // "/Users/username/.shc2es"
 * ```
 */
export function getUserConfigDir(): string {
  return path.join(os.homedir(), '.shc2es');
}

/**
 * Get certificates directory path.
 *
 * Contains client certificate and private key files generated during initial pairing.
 *
 * @returns Path to certificates directory
 *
 * @example
 * ```typescript
 * import { getCertsDir } from './config';
 * console.log(getCertsDir()); // "/Users/username/.shc2es/certs"
 * ```
 */
export function getCertsDir(): string {
  return path.join(getUserConfigDir(), 'certs');
}

/**
 * Get data directory path.
 *
 * Contains:
 * - `events-YYYY-MM-DD.ndjson` - Daily smart home event logs
 * - `device-registry.json` - Device and room metadata for enrichment
 *
 * @returns Path to data directory
 *
 * @example
 * ```typescript
 * import { getDataDir } from './config';
 * console.log(getDataDir()); // "/Users/username/.shc2es/data"
 * ```
 */
export function getDataDir(): string {
  return path.join(getUserConfigDir(), 'data');
}

/**
 * Get logs directory path.
 *
 * Contains:
 * - `poll-YYYY-MM-DD.log` - Application debug logs in JSON format
 * - Other script-specific logs (e.g., `ingest-YYYY-MM-DD.log`)
 *
 * @returns Path to logs directory
 *
 * @example
 * ```typescript
 * import { getLogsDir } from './config';
 * console.log(getLogsDir()); // "/Users/username/.shc2es/logs"
 * ```
 */
export function getLogsDir(): string {
  return path.join(getUserConfigDir(), 'logs');
}

/**
 * Get client certificate file path.
 *
 * Generated during initial pairing with the controller. Required for all API requests.
 *
 * @returns Path to client certificate file
 *
 * @example
 * ```typescript
 * import { getCertFile } from './config';
 * import { readFileSync } from 'fs';
 * const cert = readFileSync(getCertFile(), 'utf-8');
 * ```
 */
export function getCertFile(): string {
  return path.join(getCertsDir(), 'client-cert.pem');
}

/**
 * Get private key file path.
 *
 * Generated during initial pairing with the controller. Must be kept secure.
 *
 * @returns Path to private key file
 *
 * @example
 * ```typescript
 * import { getKeyFile } from './config';
 * import { readFileSync } from 'fs';
 * const key = readFileSync(getKeyFile(), 'utf-8');
 * ```
 */
export function getKeyFile(): string {
  return path.join(getCertsDir(), 'client-key.pem');
}

/**
 * Get user environment configuration file path.
 *
 * Contains environment variables like BSH_HOST, ES_NODE, credentials, etc.
 * This is the primary configuration file for production use.
 *
 * @returns Path to user .env file
 *
 * @example
 * ```typescript
 * import { getEnvFile } from './config';
 * console.log(getEnvFile()); // "/Users/username/.shc2es/.env"
 * ```
 */
export function getEnvFile(): string {
  return path.join(getUserConfigDir(), '.env');
}

/**
 * Get local development environment configuration file path.
 *
 * Used during development to override user configuration. Takes precedence over
 * the user's ~/.shc2es/.env file when it exists.
 *
 * @returns Path to local .env file
 *
 * @example
 * ```typescript
 * import { getLocalEnvFile } from './config';
 * console.log(getLocalEnvFile()); // "/path/to/project/.env"
 * ```
 */
export function getLocalEnvFile(): string {
  return path.join(process.cwd(), '.env');
}

// Check if running in development (ts-node or local)
const isDev =
  process.argv[1]?.includes('ts-node') ?? process.argv[1]?.includes('node_modules') ?? false;

/**
 * Ensure all configuration directories exist.
 *
 * Creates the user config directory and all subdirectories if they don't exist.
 * Uses `recursive: true` to create parent directories as needed. This function
 * is idempotent and safe to call multiple times.
 *
 * @throws {Error} If directory creation fails due to permissions or filesystem errors
 *
 * @example
 * ```typescript
 * import { ensureConfigDirs } from './config';
 *
 * // Create all config directories before writing files
 * ensureConfigDirs();
 * // Now safe to write to getDataDir(), getLogsDir(), etc.
 * ```
 */
export function ensureConfigDirs(): void {
  for (const dir of [getUserConfigDir(), getCertsDir(), getDataDir(), getLogsDir()]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Find the .env file to use for loading environment variables.
 *
 * Searches for environment files in priority order:
 * 1. Local .env file in current working directory (for development)
 * 2. User .env file in ~/.shc2es/.env (for production)
 *
 * @returns Path to the .env file if found, null if neither exists
 *
 * @example
 * ```typescript
 * import { findEnvFile } from './config';
 *
 * const envFile = findEnvFile();
 * if (envFile) {
 *   console.log(`Loading config from: ${envFile}`);
 * } else {
 *   console.log('No .env file found, using environment variables');
 * }
 * ```
 */
export function findEnvFile(): string | null {
  // In dev mode or if local .env exists, prefer it
  const localEnvFile = getLocalEnvFile();
  if (fs.existsSync(localEnvFile)) {
    return localEnvFile;
  }
  const envFile = getEnvFile();
  if (fs.existsSync(envFile)) {
    return envFile;
  }
  return null;
}

/**
 * Load environment variables from the appropriate .env file.
 *
 * This function should be called early in application startup (by cli.ts)
 * to ensure environment variables are available. It uses dotenv to parse
 * the .env file and add variables to process.env.
 *
 * **Side effects:**
 * - Modifies process.env with variables from .env file
 * - Prints debug output to console in development mode
 *
 * @example
 * ```typescript
 * import { loadEnv } from './config';
 *
 * // Call at application startup (done by cli.ts)
 * loadEnv();
 * console.log(process.env.BSH_HOST);
 * ```
 */
export function loadEnv(): void {
  const envFile = findEnvFile();
  if (envFile) {
    dotenv.config({ path: envFile });
    // Note: Can't use logger here as it depends on config being loaded
    // Debug output only in dev mode for troubleshooting
    if (isDev) {
      // eslint-disable-next-line no-console
      console.log(`Loaded config from: ${envFile}`);
    }
  }
}

/**
 * Get configuration paths summary for logging and debugging.
 *
 * Returns an object with all configured paths, useful for logging at startup
 * to verify the application is using the correct directories.
 *
 * @returns Object containing all configuration paths
 *
 * @example
 * ```typescript
 * import { getConfigPaths } from './config';
 * import { appLogger } from './logger';
 *
 * appLogger.info(getConfigPaths(), 'Configuration loaded');
 * // Logs:
 * // {
 * //   configDir: "/Users/username/.shc2es",
 * //   certsDir: "/Users/username/.shc2es/certs",
 * //   dataDir: "/Users/username/.shc2es/data",
 * //   logsDir: "/Users/username/.shc2es/logs",
 * //   envFile: "/Users/username/.shc2es/.env"
 * // }
 * ```
 */
export function getConfigPaths(): Record<string, string> {
  return {
    configDir: getUserConfigDir(),
    certsDir: getCertsDir(),
    dataDir: getDataDir(),
    logsDir: getLogsDir(),
    envFile: findEnvFile() ?? '(not found)',
  };
}

// Note: Legacy constant exports removed
// All code now uses functions: getUserConfigDir(), getCertsDir(), etc.
