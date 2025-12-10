import 'dotenv/config';
import { Client } from '@elastic/elasticsearch';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { glob } from 'glob';
import split from 'split2';
import chokidar from 'chokidar';
import { Tail } from 'tail';
import * as path from 'path';
import { createLogger } from './logger';

const log = createLogger('ingest');

// Environment validation
if (!process.env.ES_NODE || !process.env.ES_PASSWORD) {
  log.fatal('ES_NODE and ES_PASSWORD must be set in .env');
  process.exit(1);
}

const client = new Client({
  node: process.env.ES_NODE,
  auth: {
    username: process.env.ES_USER || 'elastic',
    password: process.env.ES_PASSWORD,
  },
  tls: { rejectUnauthorized: false },
});

const INDEX_PREFIX = process.env.ES_INDEX_PREFIX || 'smart-home-events';
const INDEX_PATTERN = `${INDEX_PREFIX}-*`;
const PIPELINE_NAME = `${INDEX_PREFIX}-pipeline`;
const TEMPLATE_NAME = `${INDEX_PREFIX}-template`;
const DATA_DIR = path.join(__dirname, '..', 'data');
const REGISTRY_FILE = path.join(DATA_DIR, 'device-registry.json');

// Extract date from filename like events-2025-12-10.ndjson
function extractDateFromFilename(filePath: string): string {
  const match = path.basename(filePath).match(/events-(\d{4}-\d{2}-\d{2})\.ndjson/);
  return match ? match[1] : new Date().toISOString().split('T')[0];
}

// Get index name for a specific date
function getIndexName(date: string): string {
  return `${INDEX_PREFIX}-${date}`;
}

// Device registry for enrichment
interface DeviceInfo {
  name: string;
  roomId?: string;
  type?: string;
}

interface RoomInfo {
  name: string;
  iconId?: string;
}

interface DeviceRegistry {
  fetchedAt: string;
  devices: Record<string, DeviceInfo>;
  rooms: Record<string, RoomInfo>;
}

let registry: DeviceRegistry | null = null;

function loadRegistry(): void {
  if (!existsSync(REGISTRY_FILE)) {
    log.warn({ registryFile: REGISTRY_FILE }, "Registry not found. Run 'yarn registry' to generate it. Events will be indexed without device/room names.");
    return;
  }

  try {
    const content = readFileSync(REGISTRY_FILE, 'utf-8');
    registry = JSON.parse(content);
    const deviceCount = Object.keys(registry!.devices).length;
    const roomCount = Object.keys(registry!.rooms).length;
    log.info({ deviceCount, roomCount, fetchedAt: registry!.fetchedAt }, 'Loaded device registry');
  } catch (err) {
    log.warn({ err }, 'Failed to load registry. Events will be indexed without device/room names.');
  }
}

// Event types from Bosch Smart Home API:
// - DeviceServiceData: sensor readings with deviceId, path, state
// - room: room updates with name, iconId, extProperties
interface SmartHomeEvent {
  time?: string;
  '@type'?: string;
  id?: string;
  // DeviceServiceData fields
  deviceId?: string;
  path?: string;
  state?: Record<string, unknown>;
  // room fields
  name?: string;
  iconId?: string;
  extProperties?: Record<string, unknown>;
  [key: string]: unknown;
}

interface Metric {
  name: string;
  value: number;
}

interface DeviceField {
  name: string;
  type?: string;
}

interface RoomField {
  id: string;
  name: string;
}

interface TransformedEvent {
  '@timestamp': string | undefined;
  '@type'?: string;
  id?: string;
  deviceId?: string;
  path?: string;
  device?: DeviceField;
  room?: RoomField;
  metric?: Metric;
}

function extractMetric(doc: SmartHomeEvent): Metric | null {
  // DeviceServiceData: extract from state object
  if (doc.state && typeof doc.state === 'object') {
    for (const [key, val] of Object.entries(doc.state)) {
      if (key !== '@type' && typeof val === 'number') {
        return { name: key, value: val };
      }
    }
  }
  // room: extract from extProperties (values are strings)
  if (doc.extProperties && typeof doc.extProperties === 'object') {
    for (const [key, val] of Object.entries(doc.extProperties)) {
      const num = parseFloat(String(val));
      if (!isNaN(num)) {
        return { name: key, value: num };
      }
    }
  }
  return null;
}

function transformDoc(doc: SmartHomeEvent): TransformedEvent {
  const result: TransformedEvent = {
    '@timestamp': doc.time,
    '@type': doc['@type'],
    id: doc.id,
  };

  // Add type-specific fields
  if (doc.deviceId) result.deviceId = doc.deviceId;
  if (doc.path) result.path = doc.path;

  // Enrich with device/room info from registry
  if (registry) {
    // For DeviceServiceData events - lookup by deviceId
    if (doc.deviceId && registry.devices[doc.deviceId]) {
      const deviceInfo = registry.devices[doc.deviceId];
      result.device = { name: deviceInfo.name };
      if (deviceInfo.type) result.device.type = deviceInfo.type;

      // Get room from device's roomId
      if (deviceInfo.roomId && registry.rooms[deviceInfo.roomId]) {
        result.room = {
          id: deviceInfo.roomId,
          name: registry.rooms[deviceInfo.roomId].name,
        };
      }
    }

    // For room events - lookup by id
    if (doc['@type'] === 'room' && doc.id && registry.rooms[doc.id]) {
      result.room = {
        id: doc.id,
        name: registry.rooms[doc.id].name,
      };
    }
  }

  // Extract and normalize metric
  const metric = extractMetric(doc);
  if (metric) result.metric = metric;

  return result;
}

function generateDocId(doc: SmartHomeEvent): string {
  // Use deviceId for DeviceServiceData, or id (room id like hz_1) for room events
  const entityId = doc.deviceId || doc.id || 'unknown';
  // Include service id (e.g., HumidityLevel, TemperatureLevel) for full uniqueness
  const serviceId = doc.deviceId ? doc.id : undefined;
  const parts = [doc['@type'], entityId, serviceId, doc.time || Date.now()].filter(Boolean);
  return parts.join('-');
}

// Parse NDJSON line, handling pino's leading comma issue
function parseLine(line: string): SmartHomeEvent | null {
  if (!line || line.trim() === '') return null;
  try {
    // Handle pino's leading comma in output
    const cleanLine = line.startsWith('{,') ? '{' + line.slice(2) : line;
    return JSON.parse(cleanLine);
  } catch {
    log.error({ linePreview: line.slice(0, 100) }, 'Failed to parse line');
    return null;
  }
}

async function setup(): Promise<void> {
  log.info('Setting up Elasticsearch pipeline and index template');

  // Create ingest pipeline
  log.info({ pipelineName: PIPELINE_NAME }, 'Creating ingest pipeline');
  await client.ingest.putPipeline({
    id: PIPELINE_NAME,
    description: 'Add event.ingested timestamp to smart home events',
    processors: [
      {
        set: {
          field: 'event.ingested',
          value: '{{{_ingest.timestamp}}}',
        },
      },
    ],
  });
  log.info('Pipeline created successfully');

  // Create index template (applies to smart-home-events-* indices)
  log.info({ templateName: TEMPLATE_NAME, indexPattern: INDEX_PATTERN }, 'Creating index template');
  await client.indices.putIndexTemplate({
    name: TEMPLATE_NAME,
    index_patterns: [INDEX_PATTERN],
    priority: 100,
    template: {
      settings: {
        index: {
          default_pipeline: PIPELINE_NAME,
        },
      },
      mappings: {
        properties: {
          '@timestamp': { type: 'date' },
          event: {
            properties: {
              ingested: { type: 'date' },
            },
          },
          '@type': { type: 'keyword' },
          id: { type: 'keyword' },
          deviceId: { type: 'keyword' },
          path: { type: 'keyword' },
          device: {
            properties: {
              name: { type: 'keyword' },
              type: { type: 'keyword' },
            },
          },
          room: {
            properties: {
              id: { type: 'keyword' },
              name: { type: 'keyword' },
            },
          },
          metric: {
            properties: {
              name: { type: 'keyword' },
              value: { type: 'float' },
            },
          },
        },
      },
    },
  });
  log.info({ indexPattern: INDEX_PATTERN }, 'Index template created. New indices will automatically use the template.');
}

async function bulkImportFile(filePath: string): Promise<number> {
  const dateStr = extractDateFromFilename(filePath);
  const indexName = getIndexName(dateStr);
  log.info({ filePath, indexName }, 'Importing file');

  const documents: Array<{ doc: TransformedEvent; id: string }> = [];

  return new Promise((resolve, reject) => {
    createReadStream(filePath)
      .pipe(split())
      .on('data', (line: string) => {
        const doc = parseLine(line);
        if (doc) {
          documents.push({
            doc: transformDoc(doc),
            id: generateDocId(doc),
          });
        }
      })
      .on('end', async () => {
        if (documents.length === 0) {
          resolve(0);
          return;
        }

        try {
          const operations = documents.flatMap(({ doc, id }) => [
            { index: { _index: indexName, _id: id } },
            doc,
          ]);

          const result = await client.bulk({ operations, refresh: true });

          if (result.errors) {
            const errors = result.items.filter((item) => item.index?.error);
            log.error({ errorCount: errors.length, errors: errors.slice(0, 3).map((item) => item.index?.error) }, 'Documents failed to index');
          }

          const indexed = result.items.filter((item) => !item.index?.error).length;
          log.info({ indexed, indexName }, 'Indexed documents');
          resolve(indexed);
        } catch (err) {
          reject(err);
        }
      })
      .on('error', reject);
  });
}

async function batchImport(): Promise<void> {
  log.info('Starting batch import');

  const files = await glob(`${DATA_DIR}/events-*.ndjson`);

  if (files.length === 0) {
    log.info({ dataDir: DATA_DIR }, 'No NDJSON files found in data directory');
    return;
  }

  log.info({ fileCount: files.length }, 'Found files to import');

  let totalIndexed = 0;
  for (const file of files.sort()) {
    const indexed = await bulkImportFile(file);
    totalIndexed += indexed;
  }

  log.info({ totalIndexed }, 'Batch import complete');
}

async function watchAndTail(): Promise<void> {
  log.info({ watchPattern: `${DATA_DIR}/events-*.ndjson` }, 'Starting watch mode');

  const activeTails = new Map<string, Tail>();

  const watcher = chokidar.watch(`${DATA_DIR}/events-*.ndjson`, {
    persistent: true,
    ignoreInitial: false,
  });

  watcher.on('add', (filePath) => {
    const dateStr = extractDateFromFilename(filePath);
    const indexName = getIndexName(dateStr);
    log.info({ filePath, indexName }, 'Tailing file');

    const tail = new Tail(filePath, { fromBeginning: false, follow: true });

    tail.on('line', async (line: string) => {
      const doc = parseLine(line);
      if (!doc) return;

      try {
        const transformed = transformDoc(doc);
        await client.index({
          index: indexName,
          id: generateDocId(doc),
          document: transformed,
        });
        log.debug({ eventType: doc['@type'], deviceId: doc.deviceId, indexName }, 'Indexed event');
      } catch (err) {
        log.error({ err }, 'Index error');
      }
    });

    tail.on('error', (err) => {
      log.error({ err, filePath }, 'Tail error');
    });

    activeTails.set(filePath, tail);
  });

  watcher.on('unlink', (filePath) => {
    const tail = activeTails.get(filePath);
    if (tail) {
      tail.unwatch();
      activeTails.delete(filePath);
      log.info({ filePath }, 'Stopped tailing file');
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    log.info('Shutting down');
    watcher.close();
    activeTails.forEach((tail) => tail.unwatch());
    process.exit(0);
  });

  log.info('Watch mode active. Press Ctrl+C to stop.');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Load device registry for enrichment (not needed for --setup)
  if (!args.includes('--setup')) {
    loadRegistry();
  }

  try {
    // Test connection
    await client.ping();
    log.info({ esNode: process.env.ES_NODE }, 'Connected to Elasticsearch');
  } catch (err) {
    log.fatal({ err }, 'Failed to connect to Elasticsearch');
    process.exit(1);
  }

  if (args.includes('--setup')) {
    await setup();
  } else if (args.includes('--watch')) {
    await watchAndTail();
  } else {
    await batchImport();
  }
}

main().catch((err) => {
  log.fatal({ err }, 'Fatal error');
  process.exit(1);
});
