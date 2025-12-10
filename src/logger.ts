import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const DATA_DIR = path.join(__dirname, '..', 'data');
const LOGS_DIR = path.join(__dirname, '..', 'logs');

// Ensure directories exist
for (const dir of [DATA_DIR, LOGS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const dateStamp = new Date().toISOString().split('T')[0];

// Factory function to create script-specific loggers
// Writes to both console (pretty) and file (JSON)
export function createLogger(scriptName: string): pino.Logger {
  const logFile = path.join(LOGS_DIR, `${scriptName}-${dateStamp}.log`);

  const logger = pino({
    name: scriptName,
    level: LOG_LEVEL,
    transport: {
      targets: [
        // Console output (pretty in dev)
        {
          target: 'pino-pretty',
          options: { colorize: true },
          level: LOG_LEVEL,
        },
        // File output (JSON for Claude Code to parse)
        {
          target: 'pino/file',
          options: { destination: logFile },
          level: LOG_LEVEL,
        },
      ],
    },
  });

  logger.info({ logFile }, 'Logging initialized');
  return logger;
}

// App logger - for debugging the polling tool itself
const appLogFile = path.join(LOGS_DIR, `poll-${dateStamp}.log`);

export const appLogger = pino({
  name: 'poll',
  level: LOG_LEVEL,
  transport: {
    targets: [
      // Console output (pretty in dev)
      {
        target: 'pino-pretty',
        options: { colorize: true },
        level: LOG_LEVEL,
      },
      // File output (JSON for Claude Code to parse)
      {
        target: 'pino/file',
        options: { destination: appLogFile },
        level: LOG_LEVEL,
      },
    ],
  },
});

// Data logger - for smart home events (NDJSON file)
// Always structured JSON, writes to timestamped file
const dataLogFile = path.join(DATA_DIR, `events-${dateStamp}.ndjson`);

export const dataLogger = pino(
  {
    name: 'data',
    level: 'info',
    // Minimal formatting - just the event data
    formatters: {
      level: () => ({}), // Omit level from data logs
      bindings: () => ({}), // Omit pid, hostname
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination(dataLogFile)
);

// Log file locations for reference
appLogger.info({ appLogFile, dataLogFile }, 'Logging initialized');

// Bridge logger for bosch-smart-home-bridge library
// Implements the library's Logger interface and forwards to pino
import type { Logger as BshbLoggerInterface } from 'bosch-smart-home-bridge';

// Serialize params, extracting Error details properly
function serializeParams(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (p instanceof Error) {
      const err = p as Error & { cause?: unknown; code?: string; errno?: number };
      return {
        name: err.name,
        message: err.message,
        stack: err.stack,
        cause: err.cause,
        code: err.code,
        errno: err.errno,
      };
    }
    if (Array.isArray(p)) {
      return serializeParams(p);
    }
    return p;
  });
}

export class BshbLogger implements BshbLoggerInterface {
  fine(message?: unknown, ...optionalParams: unknown[]): void {
    appLogger.trace({ bshb: true, params: serializeParams(optionalParams) }, String(message));
  }

  debug(message?: unknown, ...optionalParams: unknown[]): void {
    appLogger.debug({ bshb: true, params: serializeParams(optionalParams) }, String(message));
  }

  info(message?: unknown, ...optionalParams: unknown[]): void {
    appLogger.info({ bshb: true, params: serializeParams(optionalParams) }, String(message));
  }

  warn(message?: unknown, ...optionalParams: unknown[]): void {
    appLogger.warn({ bshb: true, params: serializeParams(optionalParams) }, String(message));
  }

  error(message?: unknown, ...optionalParams: unknown[]): void {
    appLogger.error({ bshb: true, params: serializeParams(optionalParams) }, String(message));
  }
}
