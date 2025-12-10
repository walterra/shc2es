import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// App logger - for debugging the polling tool itself
// Uses pino-pretty in development for human-readable output
export const appLogger = pino({
  name: 'poll',
  level: LOG_LEVEL,
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

// Data logger - for smart home events (NDJSON file)
// Always structured JSON, writes to timestamped file
const dataLogFile = path.join(
  DATA_DIR,
  `events-${new Date().toISOString().split('T')[0]}.ndjson`
);

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

// Log file location for reference
appLogger.info({ dataLogFile }, 'Data logging to file');
