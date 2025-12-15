import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as dotenv from "dotenv";

// User config directory: ~/.shc2es/
export const USER_CONFIG_DIR = path.join(os.homedir(), ".shc2es");

// Subdirectories
export const CERTS_DIR = path.join(USER_CONFIG_DIR, "certs");
export const DATA_DIR = path.join(USER_CONFIG_DIR, "data");
export const LOGS_DIR = path.join(USER_CONFIG_DIR, "logs");

// Certificate files
export const CERT_FILE = path.join(CERTS_DIR, "client-cert.pem");
export const KEY_FILE = path.join(CERTS_DIR, "client-key.pem");

// Env file location
export const ENV_FILE = path.join(USER_CONFIG_DIR, ".env");

// Check if running in development (ts-node or local)
const isDev =
  process.argv[1]?.includes("ts-node") ??
  process.argv[1]?.includes("node_modules") ??
  false;

// For development, also check local paths
export const LOCAL_ENV_FILE = path.join(process.cwd(), ".env");

/**
 * Ensure all config directories exist
 */
export function ensureConfigDirs(): void {
  for (const dir of [USER_CONFIG_DIR, CERTS_DIR, DATA_DIR, LOGS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Find the .env file to use
 * Priority: 1. Local .env (for dev), 2. ~/.shc2es/.env
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
 * Load environment variables from the appropriate .env file
 */
export function loadEnv(): void {
  const envFile = findEnvFile();
  if (envFile) {
    dotenv.config({ path: envFile });
    if (isDev) {
      console.log(`Loaded config from: ${envFile}`);
    }
  }
}

// Auto-load env vars when this module is imported
// This ensures env vars are available for logger.ts and other modules
loadEnv();

/**
 * Get config summary for logging
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
