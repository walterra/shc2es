import { Client } from '@elastic/elasticsearch';
import { Agent, fetch as undiciFetch } from 'undici';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { glob } from 'glob';
import split from 'split2';
import chokidar, { type FSWatcher } from 'chokidar';
import { Tail } from 'tail';
import * as path from 'path';
import { getDataDir } from './config';
import { createLogger, logErrorAndExit, serializeError } from './logger';
import { validateIngestConfig } from './validation';
import type { IngestConfig } from './validation';
import { withSpan, SpanAttributes } from './instrumentation'; // withSpan for high-level operations only
import type {
  ImportResponse,
  ExportMetadata,
  KibanaSavedObject,
} from './types/kibana-saved-objects';
import { isExportMetadata } from './types/kibana-saved-objects';
import type { SmartHomeEvent, GenericEvent } from './types/smart-home-events';
import { isKnownEventType } from './types/smart-home-events';
import type { Metric } from './transforms';
import { extractMetric, generateDocId } from './transforms';

const log = createLogger('ingest');

// Lazy config loading
let _config: IngestConfig | null = null;
function getConfig(): IngestConfig {
  if (_config) {
    return _config;
  }
  const configResult = validateIngestConfig({ requireKibana: false });
  if (configResult.isErr()) {
    logErrorAndExit(
      configResult.error,
      `Configuration validation failed: ${configResult.error.message}`,
    );
  }
  _config = configResult.value;
  return _config;
}
const config = new Proxy({} as IngestConfig, {
  get(_target, prop): IngestConfig[keyof IngestConfig] {
    const cfg = getConfig();
    return cfg[prop as keyof IngestConfig];
  },
});

// TLS configuration for ES client and fetch requests
interface TlsConfig {
  rejectUnauthorized?: boolean;
  ca?: Buffer;
}

// Build TLS config based on validated configuration
function buildTlsConfig(): TlsConfig {
  if (!config.esTlsVerify) {
    log.debug('TLS verification disabled via ES_TLS_VERIFY=false (development mode)');
    return { rejectUnauthorized: false };
  }

  if (config.esCaCert) {
    log.debug(
      { 'file.path': config.esCaCert },
      `Using custom CA certificate from ${config.esCaCert}`,
    );
    return { ca: readFileSync(config.esCaCert) };
  }

  return {};
}

// Create fetch with custom TLS settings for Kibana requests
function createTlsFetch(): typeof globalThis.fetch {
  const tlsConfig = buildTlsConfig();

  // If no custom TLS config needed, use global fetch
  if (Object.keys(tlsConfig).length === 0) {
    return globalThis.fetch;
  }

  const agent = new Agent({
    connect: {
      rejectUnauthorized: tlsConfig.rejectUnauthorized ?? true,
      ca: tlsConfig.ca,
    },
  });

  return ((url, options) =>
    undiciFetch(url, {
      ...options,
      dispatcher: agent,
    })) as typeof globalThis.fetch;
}

const tlsFetch = createTlsFetch();

const client = new Client({
  node: config.esNode,
  auth: {
    username: config.esUser,
    password: config.esPassword,
  },
  tls: buildTlsConfig(),
});

const INDEX_PREFIX = config.esIndexPrefix;
const INDEX_PATTERN = `${INDEX_PREFIX}-*`;
const PIPELINE_NAME = `${INDEX_PREFIX}-pipeline`;
const TEMPLATE_NAME = `${INDEX_PREFIX}-template`;
const REGISTRY_FILE = path.join(getDataDir(), 'device-registry.json');

// Kibana dashboard import
const KIBANA_NODE = config.kibanaNode;
const DASHBOARDS_DIR = path.join(__dirname, '..', 'dashboards');
const DASHBOARD_FILE = path.join(DASHBOARDS_DIR, 'smart-home.ndjson');

// Extract date from filename like events-2025-12-10.ndjson
function extractDateFromFilename(filePath: string): string {
  const match = /events-(\d{4}-\d{2}-\d{2})\.ndjson/.exec(path.basename(filePath));
  if (match?.[1]) {
    return match[1];
  }
  const isoDate = new Date().toISOString().split('T')[0];
  return isoDate ?? '1970-01-01'; // Fallback should never happen
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
  withSpan('load_registry', {}, () => {
    if (!existsSync(REGISTRY_FILE)) {
      log.warn(
        { 'file.path': REGISTRY_FILE },
        `Registry file not found at ${REGISTRY_FILE}. Run 'yarn registry' to generate it. Events will be indexed without device/room names.`,
      );
      return;
    }

    try {
      const content = readFileSync(REGISTRY_FILE, 'utf-8');
      const parsed = JSON.parse(content) as DeviceRegistry;
      registry = parsed;
      const deviceCount = Object.keys(parsed.devices).length;
      const roomCount = Object.keys(parsed.rooms).length;
      log.info(
        { 'device.count': deviceCount, 'room.count': roomCount, fetchedAt: parsed.fetchedAt },
        `Loaded device registry: ${String(deviceCount)} devices, ${String(roomCount)} rooms (fetched at ${parsed.fetchedAt})`,
      );
    } catch (err) {
      log.warn(
        serializeError(err),
        'Failed to load device registry. Events will be indexed without device/room names.',
      );
    }
  });
}

// SmartHomeEvent types now imported from ./types/smart-home-events
// Transformation functions imported from ./transforms
// Provides exhaustive type checking for all event types:
// - DeviceServiceData, device, room, message

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

function transformDoc(doc: GenericEvent): TransformedEvent {
  // Fast in-memory transformation - no span needed to avoid overwhelming OTel queue
  const result: TransformedEvent = {
    '@timestamp': doc.time,
    '@type': doc['@type'],
    id: typeof doc.id === 'string' ? doc.id : undefined,
  };

  // Check if this is a known event type - if not, log warning and index with basic fields
  if (!isKnownEventType(doc)) {
    log.warn(
      { eventType: doc['@type'], eventId: doc.id },
      `Unknown event type encountered: ${doc['@type']}. Indexing with basic field extraction only.`,
    );
    // Try to extract deviceId for unknown types (common field)
    if ('deviceId' in doc && typeof doc.deviceId === 'string') {
      result.deviceId = doc.deviceId;
    }
    // Try to extract metric from unknown types
    const metric = extractMetric(doc);
    if (metric) result.metric = metric;
    return result;
  }

  // At this point we know it's a known event type, cast for type safety
  const knownDoc = doc as unknown as SmartHomeEvent;

  // Use type narrowing for type-specific field handling
  switch (knownDoc['@type']) {
    case 'DeviceServiceData':
      // Add device service data specific fields
      result.deviceId = knownDoc.deviceId;
      result.path = knownDoc.path;

      // Enrich with device/room info from registry
      if (registry && knownDoc.deviceId in registry.devices) {
        const deviceInfo = registry.devices[knownDoc.deviceId];
        if (deviceInfo) {
          result.device = { name: deviceInfo.name };
          if (deviceInfo.type) result.device.type = deviceInfo.type;

          // Get room from device's roomId
          if (deviceInfo.roomId && deviceInfo.roomId in registry.rooms) {
            const roomInfo = registry.rooms[deviceInfo.roomId];
            if (roomInfo) {
              result.room = {
                id: deviceInfo.roomId,
                name: roomInfo.name,
              };
            }
          }
        }
      }
      break;

    case 'room':
      // Enrich room events with registry info
      if (registry && knownDoc.id in registry.rooms) {
        const roomInfo = registry.rooms[knownDoc.id];
        if (roomInfo) {
          result.room = {
            id: knownDoc.id,
            name: roomInfo.name,
          };
        }
      }
      break;

    case 'device':
    case 'message':
    case 'client':
    case 'light':
      // These event types don't need special field handling
      break;
  }

  // Extract and normalize metric (works for all types)
  const metric = extractMetric(knownDoc);
  if (metric) result.metric = metric;

  return result;
}

// Parse NDJSON line, handling pino's leading comma issue
function parseLine(line: string): GenericEvent | null {
  if (!line || line.trim() === '') return null;
  try {
    // Handle pino's leading comma in output
    const cleanLine = line.startsWith('{,') ? '{' + line.slice(2) : line;
    return JSON.parse(cleanLine) as GenericEvent;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(
      { ...serializeError(err), linePreview: line.slice(0, 100) },
      `Failed to parse NDJSON line: ${message}`,
    );
    return null;
  }
}

function prefixSavedObjectIds(ndjson: string, prefix: string): string {
  const lines = ndjson.trim().split('\n');
  const prefixedLines: string[] = [];

  for (const line of lines) {
    const obj = JSON.parse(line) as KibanaSavedObject | ExportMetadata;

    // Skip export metadata line (last line with exportedCount)
    if (isExportMetadata(obj)) {
      prefixedLines.push(line);
      continue;
    }

    // Create a new object with prefixed values (immutable approach)
    const prefixedObj: KibanaSavedObject = {
      ...obj,
      id: `${prefix}-${obj.id}`,
      references: obj.references?.map((ref) => ({
        ...ref,
        id: `${prefix}-${ref.id}`,
      })),
    };

    // Prefix dashboard title to distinguish from other deployments
    if (prefixedObj.type === 'dashboard') {
      prefixedObj.attributes = {
        ...prefixedObj.attributes,
        title: prefix,
      };
    }

    // Prefix index pattern name/title to match the prefixed indices
    if (prefixedObj.type === 'index-pattern') {
      prefixedObj.attributes = {
        ...prefixedObj.attributes,
        title: `${prefix}-*`,
        name: prefix,
      };
    }

    prefixedLines.push(JSON.stringify(prefixedObj));
  }

  return prefixedLines.join('\n');
}

async function importDashboard(): Promise<void> {
  return withSpan('import_dashboard', { [SpanAttributes.INDEX_NAME]: INDEX_PREFIX }, async () => {
    if (!KIBANA_NODE) {
      log.info(
        'KIBANA_NODE not configured, skipping dashboard import. Set KIBANA_NODE environment variable to enable automatic dashboard setup.',
      );
      return;
    }

    if (!existsSync(DASHBOARD_FILE)) {
      log.info(
        { 'file.path': DASHBOARD_FILE },
        `Dashboard file not found at ${DASHBOARD_FILE}, skipping import`,
      );
      return;
    }

    log.info(
      {
        'file.path': DASHBOARD_FILE,
        'url.full': KIBANA_NODE,
        prefix: INDEX_PREFIX,
      },
      `Importing Kibana dashboard from ${DASHBOARD_FILE} to ${KIBANA_NODE} with prefix '${INDEX_PREFIX}'`,
    );

    // Read and prefix all saved object IDs
    const fileContent = readFileSync(DASHBOARD_FILE, 'utf-8');
    const prefixedContent = prefixSavedObjectIds(fileContent, INDEX_PREFIX);

    // Create proper multipart/form-data with boundary
    const boundary = `----FormBoundary${String(Date.now())}`;
    const formDataBody = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="dashboard.ndjson"`,
      `Content-Type: application/ndjson`,
      ``,
      prefixedContent,
      `--${boundary}--`,
    ].join('\r\n');

    const auth = Buffer.from(`${config.esUser}:${config.esPassword}`).toString('base64');

    const response = await tlsFetch(`${KIBANA_NODE}/api/saved_objects/_import?overwrite=true`, {
      method: 'POST',
      headers: {
        'kbn-xsrf': 'true',
        Authorization: `Basic ${auth}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: formDataBody,
    });

    if (!response.ok) {
      const text = await response.text();
      log.error(
        { 'http.response.status_code': response.status, 'http.response.body': text },
        `Dashboard import failed with HTTP ${String(response.status)}`,
      );
      return;
    }

    const result = (await response.json()) as ImportResponse;

    if (result.success) {
      log.info(
        { successCount: result.successCount, prefix: INDEX_PREFIX },
        `Dashboard imported successfully: ${String(result.successCount)} objects with prefix '${INDEX_PREFIX}'`,
      );
    } else {
      log.error(
        { errors: result.errors },
        `Dashboard import completed with errors: ${String(result.errors?.length ?? 0)} errors`,
      );
    }
  });
}

async function setup(): Promise<void> {
  return withSpan('setup', { [SpanAttributes.INDEX_NAME]: INDEX_PREFIX }, async () => {
    log.info('Setting up Elasticsearch ingest pipeline and index template');

    // Create ingest pipeline
    log.info(
      { 'elasticsearch.pipeline': PIPELINE_NAME },
      `Creating ingest pipeline '${PIPELINE_NAME}'`,
    );
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
    log.info(
      { 'elasticsearch.pipeline': PIPELINE_NAME },
      `Ingest pipeline '${PIPELINE_NAME}' created successfully`,
    );

    // Create index template (applies to smart-home-events-* indices)
    log.info(
      { 'elasticsearch.template': TEMPLATE_NAME, 'elasticsearch.index_pattern': INDEX_PATTERN },
      `Creating index template '${TEMPLATE_NAME}' for pattern '${INDEX_PATTERN}'`,
    );
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
    log.info(
      { 'elasticsearch.index_pattern': INDEX_PATTERN, 'elasticsearch.template': TEMPLATE_NAME },
      `Index template '${TEMPLATE_NAME}' created successfully. New indices matching '${INDEX_PATTERN}' will automatically use this template.`,
    );

    // Import Kibana dashboard (if configured)
    await importDashboard();
  });
}

async function bulkImportFile(filePath: string): Promise<number> {
  return withSpan(
    'bulk_import_file',
    {
      [SpanAttributes.FILE_PATH]: filePath,
    },
    async () => {
      const dateStr = extractDateFromFilename(filePath);
      const indexName = getIndexName(dateStr);
      log.info(
        { 'file.path': filePath, 'elasticsearch.index': indexName },
        `Importing ${filePath} to index ${indexName}`,
      );

      const documents: { doc: TransformedEvent; id: string }[] = [];

      return new Promise<number>((resolve, reject) => {
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
          .on('end', () => {
            if (documents.length === 0) {
              resolve(0);
              return;
            }

            const operations = documents.flatMap(({ doc, id }) => [
              { index: { _index: indexName, _id: id } },
              doc,
            ]);

            client
              .bulk({ operations, refresh: true })
              .then((result) => {
                if (result.errors) {
                  const errors = result.items.filter((item) => item.index?.error);
                  log.error(
                    {
                      'error.count': errors.length,
                      'elasticsearch.index': indexName,
                      errors: errors.slice(0, 3).map((item) => item.index?.error),
                    },
                    `Failed to index ${String(errors.length)} documents to ${indexName}`,
                  );
                }

                const indexed = result.items.filter((item) => !item.index?.error).length;
                log.info(
                  {
                    'document.count': indexed,
                    'elasticsearch.index': indexName,
                    [SpanAttributes.DOCUMENTS_COUNT]: documents.length,
                    [SpanAttributes.INDEX_NAME]: indexName,
                  },
                  `Indexed ${String(indexed)} documents to ${indexName}`,
                );
                resolve(indexed);
              })
              .catch((err: unknown) => {
                reject(err instanceof Error ? err : new Error(String(err)));
              });
          })
          .on('error', reject);
      });
    },
  );
}

async function batchImport(pattern?: string): Promise<void> {
  const globPattern = pattern
    ? pattern.includes('/')
      ? pattern
      : `${getDataDir()}/${pattern}`
    : `${getDataDir()}/events-*.ndjson`;

  log.info({ 'file.pattern': globPattern }, `Starting batch import with pattern: ${globPattern}`);

  const files = await glob(globPattern);

  if (files.length === 0) {
    log.info(
      { 'file.path': getDataDir() },
      `No NDJSON files found in data directory: ${getDataDir()}`,
    );
    return;
  }

  log.info({ 'file.count': files.length }, `Found ${String(files.length)} files to import`);

  let totalIndexed = 0;
  for (const file of files.sort()) {
    const indexed = await bulkImportFile(file);
    totalIndexed += indexed;
  }

  log.info(
    { 'document.count': totalIndexed },
    `Batch import complete: indexed ${String(totalIndexed)} documents`,
  );
}

/**
 * Index a single event to Elasticsearch
 * @param doc - Parsed smart home event (known or unknown type)
 * @param indexName - Target index name
 */
function indexSingleEvent(doc: GenericEvent, indexName: string): void {
  const transformed = transformDoc(doc);
  client
    .index({
      index: indexName,
      id: generateDocId(doc),
      document: transformed,
    })
    .then(() => {
      let deviceId: string | undefined;
      if (isKnownEventType(doc)) {
        const knownDoc = doc as unknown as SmartHomeEvent;
        deviceId =
          knownDoc['@type'] === 'DeviceServiceData' ? knownDoc.deviceId : undefined;
      } else if ('deviceId' in doc && typeof doc.deviceId === 'string') {
        deviceId = doc.deviceId;
      }
      log.debug(
        { 'event.type': doc['@type'], 'device.id': deviceId, 'elasticsearch.index': indexName },
        `Indexed ${doc['@type']} event${deviceId ? ` from device ${deviceId}` : ''} to ${indexName}`,
      );
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error(serializeError(err), `Failed to index event: ${message}`);
    });
}

/**
 * Start tailing a file and index new events
 * @param filePath - Path to file to tail
 * @param indexName - Target index name
 * @returns Tail instance
 */
function startTailing(filePath: string, indexName: string): Tail {
  log.info(
    { 'file.path': filePath, 'elasticsearch.index': indexName },
    `Tailing ${filePath} to index ${indexName}`,
  );

  const tail = new Tail(filePath, { fromBeginning: false, follow: true });

  tail.on('line', (line: string) => {
    const doc = parseLine(line);
    if (doc) {
      indexSingleEvent(doc, indexName);
    }
  });

  tail.on('error', (err) => {
    const message = err instanceof Error ? err.message : String(err);
    log.error(
      { ...serializeError(err), 'file.path': filePath },
      `Tail error for ${filePath}: ${message}`,
    );
  });

  return tail;
}

/**
 * Start file watcher for current day's events file
 * @param filePath - Path to file to watch
 * @param indexName - Target index name
 * @returns Watcher instance and tail reference
 */
function startFileWatcher(
  filePath: string,
  indexName: string,
): { watcher: FSWatcher; tailRef: { current: Tail | null } } {
  const tailRef = { current: null as Tail | null };

  const watcher = chokidar.watch(filePath, {
    persistent: true,
    ignoreInitial: false,
  });

  watcher.on('ready', () => {
    log.info(`File watcher ready, monitoring ${filePath}`);
  });

  watcher.on('error', (err) => {
    const message = err instanceof Error ? err.message : String(err);
    log.error(serializeError(err), `File watcher error: ${message}`);
  });

  watcher.on('add', (addedPath) => {
    tailRef.current = startTailing(addedPath, indexName);
  });

  watcher.on('unlink', (unlinkedPath) => {
    if (tailRef.current) {
      tailRef.current.unwatch();
      tailRef.current = null;
      log.info(
        { 'file.path': unlinkedPath },
        `Stopped tailing ${unlinkedPath} (file removed or rotated)`,
      );
    }
  });

  return { watcher, tailRef };
}

/**
 * Watch current day's file and tail for new events (live ingestion mode)
 */
function watchAndTail(): void {
  // Get current day's file
  const today = new Date().toISOString().split('T')[0] ?? '';
  const todayFile = path.join(getDataDir(), `events-${today}.ndjson`);
  const indexName = getIndexName(today);

  log.info(
    { 'file.path': todayFile, 'elasticsearch.index': indexName },
    `Starting watch mode for ${todayFile} → ${indexName}`,
  );

  const { watcher, tailRef } = startFileWatcher(todayFile, indexName);

  // Graceful shutdown
  process.on('SIGINT', () => {
    log.info('Shutting down watch mode');
    void watcher.close();
    if (tailRef.current) {
      tailRef.current.unwatch();
    }
    process.exit(0);
  });

  log.info('Watch mode active for real-time ingestion. Press Ctrl+C to stop.');
}

/**
 * Main entry point for the ingest CLI
 * Handles command-line arguments and orchestrates data ingestion
 */
export async function main(): Promise<void> {
  // Env already loaded by cli.ts
  const args = process.argv.slice(2);

  // Load device registry for enrichment (not needed for --setup)
  if (!args.includes('--setup')) {
    loadRegistry();
  }

  try {
    // Test connection
    await client.ping();
    log.info({ 'url.full': config.esNode }, `Connected to Elasticsearch at ${config.esNode}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.fatal(
      serializeError(err),
      `Failed to connect to Elasticsearch at ${config.esNode}: ${message}`,
    );
    process.exit(1);
  }

  if (args.includes('--setup')) {
    await setup();
  } else if (args.includes('--watch')) {
    watchAndTail();
  } else {
    // Parse --pattern option
    const patternIndex = args.indexOf('--pattern');
    const pattern =
      patternIndex !== -1 && args[patternIndex + 1] ? args[patternIndex + 1] : undefined;
    await batchImport(pattern);
  }
}

// Module exports functions - main() is called by cli.ts
// No auto-execution on import, keeping module side-effect free for tests
