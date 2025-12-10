import 'dotenv/config';
import { Client } from '@elastic/elasticsearch';
import { createReadStream } from 'fs';
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

interface SmartHomeEvent {
  time?: string;
  '@type'?: string;
  id?: string;
  deviceId?: string;
  path?: string;
  state?: Record<string, unknown>;
  [key: string]: unknown;
}

interface TransformedEvent {
  '@timestamp': string | undefined;
  '@type'?: string;
  id?: string;
  deviceId?: string;
  path?: string;
  state?: Record<string, unknown>;
  [key: string]: unknown;
}

function transformDoc(doc: SmartHomeEvent): TransformedEvent {
  const { time, ...rest } = doc;
  return {
    '@timestamp': time,
    ...rest,
  };
}

function generateDocId(doc: SmartHomeEvent): string {
  return `${doc.deviceId || 'unknown'}-${doc.time || Date.now()}`;
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
        state: { type: 'object', dynamic: true },
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
