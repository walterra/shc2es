import pino from 'pino';
import * as path from 'path';
import * as fs from 'fs';
import { Transform } from 'stream';
import { getDataDir, getLogsDir, ensureConfigDirs } from './config';

// Ensure config directories exist before creating file loggers
ensureConfigDirs();

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';

// Service name from OTEL_SERVICE_NAME (set per-script in package.json)
// Falls back to 'shc2es' if not set
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? 'shc2es';

// Check if OTel is enabled (SDK not disabled)
const OTEL_LOGS_ENABLED = process.env.OTEL_SDK_DISABLED !== 'true';

// Build logger name - uses full service name (e.g., shc2es-poll)
// and appends component for sub-loggers (e.g., shc2es-poll:data)
function buildLoggerName(component?: string): string {
  return component ? `${SERVICE_NAME}:${component}` : SERVICE_NAME;
}

const dateStamp = new Date().toISOString().split('T')[0] ?? '1970-01-01';

/**
 * Create a script-specific logger with multiple transports.
 *
 * Creates a pino logger that writes to:
 * - Console (pretty-printed with colors for development)
 * - File (JSON format for parsing by tools like Claude Code)
 * - OpenTelemetry (if enabled via OTEL_SDK_DISABLED !== 'true')
 *
 * The logger name is derived from OTEL_SERVICE_NAME environment variable.
 * Set per-script in package.json (e.g., 'shc2es-poll').
 *
 * @param logFilePrefix - Prefix for the log file name (e.g., 'poll' -> 'poll-2025-12-14.log')
 * @returns Configured pino logger instance
 *
 * @example
 * ```typescript
 * import { createLogger, serializeError } from './logger';
 *
 * const log = createLogger('ingest');
 * log.info({ 'url.full': 'https://localhost:9200' }, 'Connected to Elasticsearch at https://localhost:9200');
 *
 * try {
 *   await connectToES();
 * } catch (error) {
 *   log.error(serializeError(error), `Failed to connect: ${error instanceof Error ? error.message : String(error)}`);
 * }
 * ```
 */
export function createLogger(logFilePrefix: string): pino.Logger {
  const logFile = path.join(getLogsDir(), `${logFilePrefix}-${dateStamp}.log`);
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

/**
 * Application logger for debugging the polling tool.
 *
 * This is the primary logger used by poll.ts for application-level logging
 * (errors, status updates, debugging information). Writes to:
 * - Console (pretty-printed)
 * - File: ~/.shc2es/logs/poll-YYYY-MM-DD.log (JSON)
 * - OpenTelemetry (if enabled)
 *
 * **Do not use for smart home event data** - use dataLogger for that.
 *
 * @example
 * ```typescript
 * import { appLogger, serializeError } from './logger';
 *
 * appLogger.info({ 'host.ip': '192.168.1.10' }, 'Connected to controller at 192.168.1.10');
 * appLogger.warn({ 'retry.count': 3 }, 'Retrying failed request (attempt 3)');
 *
 * try {
 *   await operation();
 * } catch (error) {
 *   appLogger.error(serializeError(error), `Operation failed: ${error instanceof Error ? error.message : String(error)}`);
 * }
 * ```
 */
// Lazy logger initialization to support mocking in tests
let _appLogger: pino.Logger | undefined;

function getAppLogger(): pino.Logger {
  if (_appLogger) {
    return _appLogger;
  }

  const appLogFile = path.join(getLogsDir(), `poll-${dateStamp}.log`);

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

  _appLogger = pino({
    name: buildLoggerName(), // Uses SERVICE_NAME (shc2es-poll)
    level: LOG_LEVEL,
    transport: {
      targets: appLoggerTargets,
    },
  });

  _appLogger.info({ logFile: appLogFile }, 'App logging initialized');
  return _appLogger;
}

export const appLogger = new Proxy({} as pino.Logger, {
  get(_target, prop): unknown {
    const logger = getAppLogger();
    const value = logger[prop as keyof pino.Logger];
    if (typeof value === 'function') {
      return value.bind(logger);
    }
    return value;
  },
});

/**
 * Data logger for smart home events.
 *
 * This logger is specifically for recording smart home event data in NDJSON format
 * for ingestion into Elasticsearch. Each log line is a complete JSON document
 * representing a smart home event (device readings, room updates, messages, etc.).
 *
 * **Differences from appLogger:**
 * - Writes only to file (no console or OpenTelemetry)
 * - Minimal formatting (no level, no bindings like pid/hostname)
 * - NDJSON format (newline-delimited JSON)
 * - File location: ~/.shc2es/data/events-YYYY-MM-DD.ndjson
 *
 * **Do not use for debugging** - use appLogger for that.
 *
 * @example
 * ```typescript
 * import { dataLogger } from './logger';
 *
 * // Log a device service data event
 * dataLogger.info({
 *   '@type': 'DeviceServiceData',
 *   time: new Date().toISOString(),
 *   deviceId: 'hdm:ZigBee:001e5e0902b94515',
 *   state: { humidity: 42.71 }
 * });
 * ```
 */
// Lazy data logger initialization
let _dataLogger: pino.Logger | undefined;

function getDataLogger(): pino.Logger {
  if (_dataLogger) {
    return _dataLogger;
  }

  const dataLogFile = path.join(getDataDir(), `events-${dateStamp}.ndjson`);

  // Create a writable stream that strips Pino metadata before writing
  const stripMetadataTransform = new Transform({
    transform(chunk: Buffer, encoding: string, callback: (error?: Error | null) => void): void {
      try {
        const line = chunk.toString();
        if (!line.trim()) {
          callback();
          return;
        }

        const obj = JSON.parse(line) as Record<string, unknown>;
        // Strip only Pino-specific metadata fields
        // Do NOT strip 'time' as it belongs to the event, not Pino (we disabled Pino's timestamp)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { level, pid, hostname, name, msg, ...eventData } = obj;
        // Write clean event data as NDJSON
        this.push(JSON.stringify(eventData) + '\n');
        callback();
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });

  const fileStream = fs.createWriteStream(dataLogFile, {
    flags: 'a',
    encoding: 'utf8',
  });

  stripMetadataTransform.pipe(fileStream);

  _dataLogger = pino(
    {
      level: 'info',
      timestamp: false, // Events have their own timestamp field
      base: null, // Don't add pid/hostname/name
    },
    stripMetadataTransform,
  );

  return _dataLogger;
}

export const dataLogger = new Proxy({} as pino.Logger, {
  get(_target, prop): unknown {
    const logger = getDataLogger();
    const value = logger[prop as keyof pino.Logger];
    if (typeof value === 'function') {
      return value.bind(logger);
    }
    return value;
  },
});

// Note: If validation fails immediately, you may see "Fatal error: sonic boom is not ready yet"
// This is a harmless internal pino message - the error was already written via errorLogger
// See: https://github.com/pinojs/pino/issues/871

/**
 * Serialize an error object to ECS-compliant fields.
 *
 * Extracts error details into Elastic Common Schema (ECS) format for consistent
 * error logging across the application. Returns an object with dotted field names
 * that can be spread into log calls.
 *
 * **ECS fields returned:**
 * - `error.message` - Human-readable error message
 * - `error.stack_trace` - Full stack trace (if available)
 * - `error.type` - Error class name (e.g., "TypeError", "ConnectionError")
 * - `error.code` - Error code (if available, e.g., "ECONNREFUSED")
 * - `error.cause` - Nested cause error (recursively serialized)
 *
 * @param error - Error object, string, or unknown value to serialize
 * @returns Object with ECS-compliant error fields
 *
 * @example
 * ```typescript
 * import { serializeError } from './logger';
 *
 * try {
 *   await connectToDatabase();
 * } catch (error) {
 *   log.error(
 *     serializeError(error),
 *     `Failed to connect to database: ${error instanceof Error ? error.message : String(error)}`
 *   );
 * }
 * ```
 *
 * @see {@link https://www.elastic.co/guide/en/ecs/current/ecs-error.html|ECS Error Fields}
 */
export function serializeError(error: unknown): Record<string, unknown> {
  // Handle non-Error values
  if (typeof error === 'string') {
    return {
      'error.message': error,
      'error.type': 'string',
    };
  }

  if (!(error instanceof Error)) {
    // Handle objects with null prototype or broken toString
    let errorMessage: string;
    try {
      errorMessage = String(error);
    } catch {
      errorMessage = '[Unstringifiable value]';
    }

    return {
      'error.message': errorMessage,
      'error.type': typeof error,
    };
  }

  // Serialize Error object with ECS fields
  const err = error as Error & {
    cause?: unknown;
    code?: string;
    errno?: number;
  };

  const result: Record<string, unknown> = {
    'error.message': err.message,
    'error.type': err.name || err.constructor.name,
  };

  // Add stack trace if available
  if (err.stack) {
    result['error.stack_trace'] = err.stack;
  }

  // Add error code if available
  if (err.code) {
    result['error.code'] = err.code;
  }

  // Add errno if available (for Node.js system errors)
  if (err.errno !== undefined) {
    result['error.errno'] = err.errno;
  }

  // Recursively serialize cause if present
  if (err.cause) {
    result['error.cause'] = serializeError(err.cause);
  }

  return result;
}

// Bridge logger for bosch-smart-home-bridge library
// Implements the library's Logger interface and forwards to pino
import type { Logger as BshbLoggerInterface } from 'bosch-smart-home-bridge';

// Serialize params, extracting Error details properly
function serializeParams(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (p instanceof Error) {
      const err = p as Error & {
        cause?: unknown;
        code?: string;
        errno?: number;
      };
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

/**
 * Bridge logger adapter for the bosch-smart-home-bridge library.
 *
 * The bosch-smart-home-bridge library expects a logger with a console-like interface
 * (fine, debug, info, warn, error methods). This class implements that interface
 * and forwards all log calls to the pino-based appLogger with proper formatting.
 *
 * **Features:**
 * - Serializes Error objects properly (extracts name, message, stack, cause, code)
 * - Adds `bshb: true` field to distinguish library logs from app logs
 * - Maps library log levels to pino levels (fine -> trace)
 *
 * @example
 * ```typescript
 * import { BshbLogger } from './logger';
 * import { BoschSmartHomeBridgeBuilder } from 'bosch-smart-home-bridge';
 *
 * const bshb = BoschSmartHomeBridgeBuilder.builder()
 *   .withHost(host)
 *   .withLogger(new BshbLogger())
 *   .build();
 * ```
 */
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
