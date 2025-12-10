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

// App logger - for debugging the polling tool itself
// Writes to both console (pretty) and file (JSON)
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
