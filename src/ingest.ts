import 'dotenv/config';
import { Client } from '@elastic/elasticsearch';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { glob } from 'glob';
import split from 'split2';
import chokidar from 'chokidar';
import { Tail } from 'tail';
import * as path from 'path';

// Environment validation
if (!process.env.ES_NODE || !process.env.ES_PASSWORD) {
  console.error('ES_NODE and ES_PASSWORD must be set in .env');
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

const INDEX_NAME = 'smart-home-events';
const PIPELINE_NAME = 'smart-home-events-pipeline';
const DATA_DIR = path.join(__dirname, '..', 'data');
const REGISTRY_FILE = path.join(DATA_DIR, 'device-registry.json');

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
    console.warn(`Warning: ${REGISTRY_FILE} not found. Run 'yarn registry' to generate it.`);
    console.warn('Events will be indexed without device/room names.\n');
    return;
  }

  try {
    const content = readFileSync(REGISTRY_FILE, 'utf-8');
    registry = JSON.parse(content);
    const deviceCount = Object.keys(registry!.devices).length;
    const roomCount = Object.keys(registry!.rooms).length;
    console.log(`Loaded registry: ${deviceCount} devices, ${roomCount} rooms (fetched: ${registry!.fetchedAt})`);
  } catch (err) {
    console.warn(`Warning: Failed to load registry: ${err}`);
    console.warn('Events will be indexed without device/room names.\n');
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
  return `${doc['@type']}-${entityId}-${doc.time || Date.now()}`;
}

// Parse NDJSON line, handling pino's leading comma issue
function parseLine(line: string): SmartHomeEvent | null {
  if (!line || line.trim() === '') return null;
  try {
    // Handle pino's leading comma in output
    const cleanLine = line.startsWith('{,') ? '{' + line.slice(2) : line;
    return JSON.parse(cleanLine);
  } catch {
    console.error('Failed to parse line:', line.slice(0, 100));
    return null;
  }
}

async function setup(): Promise<void> {
  console.log('Setting up Elasticsearch index and pipeline...');

  // Create ingest pipeline
  console.log(`Creating ingest pipeline: ${PIPELINE_NAME}`);
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
  console.log('Pipeline created successfully');

  // Check if index exists
  const indexExists = await client.indices.exists({ index: INDEX_NAME });
  if (indexExists) {
    console.log(`Index ${INDEX_NAME} already exists`);
    return;
  }

  // Create index with mapping
  console.log(`Creating index: ${INDEX_NAME}`);
  await client.indices.create({
    index: INDEX_NAME,
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
  });
  console.log('Index created successfully');
}

async function bulkImportFile(filePath: string): Promise<number> {
  console.log(`Importing: ${filePath}`);

  let count = 0;
  const documents: Array<{ doc: TransformedEvent; id: string }> = [];

  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath)
      .pipe(split())
      .on('data', (line: string) => {
        const doc = parseLine(line);
        if (doc) {
          documents.push({
            doc: transformDoc(doc),
            id: generateDocId(doc),
          });
          count++;
        }
      })
      .on('end', async () => {
        if (documents.length === 0) {
          resolve(0);
          return;
        }

        try {
          const operations = documents.flatMap(({ doc, id }) => [
            { index: { _index: INDEX_NAME, _id: id } },
            doc,
          ]);

          const result = await client.bulk({ operations, refresh: true });

          if (result.errors) {
            const errors = result.items.filter((item) => item.index?.error);
            console.error(`${errors.length} documents failed to index`);
            errors.slice(0, 3).forEach((item) => {
              console.error('Error:', item.index?.error);
            });
          }

          const indexed = result.items.filter((item) => !item.index?.error).length;
          console.log(`Indexed ${indexed} documents from ${path.basename(filePath)}`);
          resolve(indexed);
        } catch (err) {
          reject(err);
        }
      })
      .on('error', reject);
  });
}

async function batchImport(): Promise<void> {
  console.log('Starting batch import...');

  const files = await glob(`${DATA_DIR}/events-*.ndjson`);

  if (files.length === 0) {
    console.log('No NDJSON files found in data directory');
    return;
  }

  console.log(`Found ${files.length} file(s) to import`);

  let totalIndexed = 0;
  for (const file of files.sort()) {
    const indexed = await bulkImportFile(file);
    totalIndexed += indexed;
  }

  console.log(`\nBatch import complete: ${totalIndexed} total documents indexed`);
}

async function watchAndTail(): Promise<void> {
  console.log('Starting watch mode...');
  console.log(`Watching: ${DATA_DIR}/events-*.ndjson`);

  const activeTails = new Map<string, Tail>();

  const watcher = chokidar.watch(`${DATA_DIR}/events-*.ndjson`, {
    persistent: true,
    ignoreInitial: false,
  });

  watcher.on('add', (filePath) => {
    console.log(`Tailing: ${filePath}`);

    const tail = new Tail(filePath, { fromBeginning: false, follow: true });

    tail.on('line', async (line: string) => {
      const doc = parseLine(line);
      if (!doc) return;

      try {
        const transformed = transformDoc(doc);
        await client.index({
          index: INDEX_NAME,
          id: generateDocId(doc),
          document: transformed,
        });
        console.log(`Indexed event: ${doc['@type']} from ${doc.deviceId || 'unknown'}`);
      } catch (err) {
        console.error('Index error:', err);
      }
    });

    tail.on('error', (err) => {
      console.error(`Tail error for ${filePath}:`, err);
    });

    activeTails.set(filePath, tail);
  });

  watcher.on('unlink', (filePath) => {
    const tail = activeTails.get(filePath);
    if (tail) {
      tail.unwatch();
      activeTails.delete(filePath);
      console.log(`Stopped tailing: ${filePath}`);
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    watcher.close();
    activeTails.forEach((tail) => tail.unwatch());
    process.exit(0);
  });

  console.log('Watch mode active. Press Ctrl+C to stop.');
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
    console.log('Connected to Elasticsearch');
  } catch (err) {
    console.error('Failed to connect to Elasticsearch:', err);
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
  console.error('Fatal error:', err);
  process.exit(1);
});
