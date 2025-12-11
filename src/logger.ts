import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const DATA_DIR = path.join(__dirname, '..', 'data');
const LOGS_DIR = path.join(__dirname, '..', 'logs');

// Service name from OTEL_SERVICE_NAME (set per-script in package.json)
// Falls back to 'bosch-smart-home' if not set
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'bosch-smart-home';

// Check if OTel is enabled (SDK not disabled)
const OTEL_LOGS_ENABLED = process.env.OTEL_SDK_DISABLED !== 'true';

// Build logger name - uses full service name (e.g., bosch-smart-home-poll)
// and appends component for sub-loggers (e.g., bosch-smart-home-poll:data)
function buildLoggerName(component?: string): string {
  return component ? `${SERVICE_NAME}:${component}` : SERVICE_NAME;
}

// Ensure directories exist
for (const dir of [DATA_DIR, LOGS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const dateStamp = new Date().toISOString().split('T')[0];

// Factory function to create script-specific loggers
// Writes to console (pretty), file (JSON), and OTel (if enabled)
// Uses OTEL_SERVICE_NAME as the logger name (set per-script in package.json)
export function createLogger(logFilePrefix: string): pino.Logger {
  const logFile = path.join(LOGS_DIR, `${logFilePrefix}-${dateStamp}.log`);
  const loggerName = buildLoggerName(); // Uses SERVICE_NAME directly

  const targets: pino.TransportTargetOptions[] = [
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
  ];

  // Add OpenTelemetry transport if enabled
  if (OTEL_LOGS_ENABLED) {
    targets.push({
      target: 'pino-opentelemetry-transport',
      options: {
        // Uses OTEL_EXPORTER_OTLP_ENDPOINT or defaults to http://localhost:4318
      },
      level: LOG_LEVEL,
    });
  }

  const logger = pino({
    name: loggerName,
    level: LOG_LEVEL,
    transport: {
      targets,
    },
  });

  logger.info({ logFile, serviceName: SERVICE_NAME }, 'Logging initialized');
  return logger;
}

// App logger - for debugging the polling tool itself
const appLogFile = path.join(LOGS_DIR, `poll-${dateStamp}.log`);

// Build transport targets array
const appLoggerTargets: pino.TransportTargetOptions[] = [
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
];

// Add OpenTelemetry transport if enabled
if (OTEL_LOGS_ENABLED) {
  appLoggerTargets.push({
    target: 'pino-opentelemetry-transport',
    options: {
      // Uses OTEL_EXPORTER_OTLP_ENDPOINT or defaults to http://localhost:4318
    },
    level: LOG_LEVEL,
  });
}

export const appLogger = pino({
  name: buildLoggerName(), // Uses SERVICE_NAME (bosch-smart-home-poll)
  level: LOG_LEVEL,
  transport: {
    targets: appLoggerTargets,
  },
});

// Data logger - for smart home events (NDJSON file)
// Always structured JSON, writes to timestamped file
const dataLogFile = path.join(DATA_DIR, `events-${dateStamp}.ndjson`);

export const dataLogger = pino(
  {
    name: buildLoggerName('data'), // bosch-smart-home-poll:data
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
