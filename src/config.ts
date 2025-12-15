import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as dotenv from "dotenv";

/**
 * User configuration directory.
 *
 * All application data, logs, and configuration files are stored under this directory
 * to keep user data separate from the application installation.
 *
 * @example
 * ```typescript
 * import { USER_CONFIG_DIR } from './config';
 * console.log(USER_CONFIG_DIR); // "/Users/username/.shc2es"
 * ```
 */
export const USER_CONFIG_DIR = path.join(os.homedir(), ".shc2es");

/**
 * Directory for TLS certificates used to authenticate with the Smart Home Controller.
 *
 * Contains client certificate and private key files generated during initial pairing.
 *
 * @example
 * ```typescript
 * import { CERTS_DIR } from './config';
 * console.log(CERTS_DIR); // "/Users/username/.shc2es/certs"
 * ```
 */
export const CERTS_DIR = path.join(USER_CONFIG_DIR, "certs");

/**
 * Directory for data files (NDJSON event logs and device registry).
 *
 * Contains:
 * - `events-YYYY-MM-DD.ndjson` - Daily smart home event logs
 * - `device-registry.json` - Device and room metadata for enrichment
 *
 * @example
 * ```typescript
 * import { DATA_DIR } from './config';
 * console.log(DATA_DIR); // "/Users/username/.shc2es/data"
 * ```
 */
export const DATA_DIR = path.join(USER_CONFIG_DIR, "data");

/**
 * Directory for application logs (debug/error logs).
 *
 * Contains:
 * - `poll-YYYY-MM-DD.log` - Application debug logs in JSON format
 * - Other script-specific logs (e.g., `ingest-YYYY-MM-DD.log`)
 *
 * @example
 * ```typescript
 * import { LOGS_DIR } from './config';
 * console.log(LOGS_DIR); // "/Users/username/.shc2es/logs"
 * ```
 */
export const LOGS_DIR = path.join(USER_CONFIG_DIR, "logs");

/**
 * Path to the client certificate file used for Smart Home Controller authentication.
 *
 * Generated during initial pairing with the controller. Required for all API requests.
 *
 * @example
 * ```typescript
 * import { CERT_FILE } from './config';
 * import { readFileSync } from 'fs';
 * const cert = readFileSync(CERT_FILE, 'utf-8');
 * ```
 */
export const CERT_FILE = path.join(CERTS_DIR, "client-cert.pem");

/**
 * Path to the private key file used for Smart Home Controller authentication.
 *
 * Generated during initial pairing with the controller. Must be kept secure.
 *
 * @example
 * ```typescript
 * import { KEY_FILE } from './config';
 * import { readFileSync } from 'fs';
 * const key = readFileSync(KEY_FILE, 'utf-8');
 * ```
 */
export const KEY_FILE = path.join(CERTS_DIR, "client-key.pem");

/**
 * Path to the user environment configuration file.
 *
 * Contains environment variables like BSH_HOST, ES_NODE, credentials, etc.
 * This is the primary configuration file for production use.
 *
 * @example
 * ```typescript
 * import { ENV_FILE } from './config';
 * console.log(ENV_FILE); // "/Users/username/.shc2es/.env"
 * ```
 */
export const ENV_FILE = path.join(USER_CONFIG_DIR, ".env");

// Check if running in development (ts-node or local)
const isDev =
  process.argv[1]?.includes("ts-node") ??
  process.argv[1]?.includes("node_modules") ??
  false;

/**
 * Path to the local development environment configuration file.
 *
 * Used during development to override user configuration. Takes precedence over
 * the user's ~/.shc2es/.env file when it exists.
 *
 * @example
 * ```typescript
 * import { LOCAL_ENV_FILE } from './config';
 * console.log(LOCAL_ENV_FILE); // "/path/to/project/.env"
 * ```
 */
export const LOCAL_ENV_FILE = path.join(process.cwd(), ".env");

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
 * // Now safe to write to DATA_DIR, LOGS_DIR, etc.
 * ```
 */
export function ensureConfigDirs(): void {
  for (const dir of [USER_CONFIG_DIR, CERTS_DIR, DATA_DIR, LOGS_DIR]) {
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
  if (fs.existsSync(LOCAL_ENV_FILE)) {
    return LOCAL_ENV_FILE;
  }
  if (fs.existsSync(ENV_FILE)) {
    return ENV_FILE;
  }
  return null;
}

/**
 * Load environment variables from the appropriate .env file.
 *
 * This function is called automatically when this module is imported, so environment
 * variables are available to all modules that import from config. It uses dotenv to
 * parse the .env file and add variables to process.env.
 *
 * **Side effects:**
 * - Modifies process.env with variables from .env file
 * - Prints debug output to console in development mode
 *
 * @example
 * ```typescript
 * // Typically not called directly - runs automatically on import
 * import './config'; // loadEnv() runs here
 *
 * // But can be called manually if needed
 * import { loadEnv } from './config';
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

// Auto-load env vars when this module is imported
// This ensures env vars are available for logger.ts and other modules
loadEnv();

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
    configDir: USER_CONFIG_DIR,
    certsDir: CERTS_DIR,
    dataDir: DATA_DIR,
    logsDir: LOGS_DIR,
    envFile: findEnvFile() ?? "(not found)",
  };
}
