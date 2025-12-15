import { Client } from "@elastic/elasticsearch";
import { Agent, fetch as undiciFetch } from "undici";
import { createReadStream, existsSync, readFileSync } from "fs";
import { glob } from "glob";
import split from "split2";
import chokidar from "chokidar";
import { Tail } from "tail";
import * as path from "path";
import { DATA_DIR } from "./config";
import { createLogger } from "./logger";
import { validateIngestConfig } from "./validation";
import { withSpan, SpanAttributes } from "./instrumentation"; // withSpan for high-level operations only

const log = createLogger("ingest");

// Validate configuration early
const validatedConfig = validateIngestConfig({ requireKibana: false });
if (!validatedConfig) {
  process.exit(1);
}
// TypeScript now knows config is defined
const config = validatedConfig;

// TLS configuration for ES client and fetch requests
interface TlsConfig {
  rejectUnauthorized?: boolean;
  ca?: Buffer;
}

// Build TLS config based on validated configuration
function buildTlsConfig(): TlsConfig {
  if (!config.esTlsVerify) {
    log.debug("TLS verification disabled via ES_TLS_VERIFY=false");
    return { rejectUnauthorized: false };
  }

  if (config.esCaCert) {
    log.debug({ path: config.esCaCert }, "Using custom CA certificate");
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
const REGISTRY_FILE = path.join(DATA_DIR, "device-registry.json");

// Kibana dashboard import
const KIBANA_NODE = config.kibanaNode;
const DASHBOARDS_DIR = path.join(__dirname, "..", "dashboards");
const DASHBOARD_FILE = path.join(DASHBOARDS_DIR, "smart-home.ndjson");

// Extract date from filename like events-2025-12-10.ndjson
function extractDateFromFilename(filePath: string): string {
  const match = /events-(\d{4}-\d{2}-\d{2})\.ndjson/.exec(
    path.basename(filePath),
  );
  return match ? match[1] : new Date().toISOString().split("T")[0];
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
  withSpan("load_registry", {}, () => {
    if (!existsSync(REGISTRY_FILE)) {
      log.warn(
        { registryFile: REGISTRY_FILE },
        "Registry not found. Run 'yarn registry' to generate it. Events will be indexed without device/room names.",
      );
      return;
    }

    try {
      const content = readFileSync(REGISTRY_FILE, "utf-8");
      const parsed = JSON.parse(content) as DeviceRegistry;
      registry = parsed;
      const deviceCount = Object.keys(parsed.devices).length;
      const roomCount = Object.keys(parsed.rooms).length;
      log.info(
        { deviceCount, roomCount, fetchedAt: parsed.fetchedAt },
        "Loaded device registry",
      );
    } catch (err) {
      log.warn(
        { err },
        "Failed to load registry. Events will be indexed without device/room names.",
      );
    }
  });
}

// Event types from Bosch Smart Home API:
// - DeviceServiceData: sensor readings with deviceId, path, state
// - room: room updates with name, iconId, extProperties
interface SmartHomeEvent {
  time?: string;
  "@type"?: string;
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
  "@timestamp": string | undefined;
  "@type"?: string;
  id?: string;
  deviceId?: string;
  path?: string;
  device?: DeviceField;
  room?: RoomField;
  metric?: Metric;
}

function extractMetric(doc: SmartHomeEvent): Metric | null {
  // DeviceServiceData: extract from state object
  if (doc.state && typeof doc.state === "object") {
    for (const [key, val] of Object.entries(doc.state)) {
      if (key !== "@type" && typeof val === "number") {
        return { name: key, value: val };
      }
    }
  }
  // room: extract from extProperties (values are strings)
  if (doc.extProperties && typeof doc.extProperties === "object") {
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
  // Fast in-memory transformation - no span needed to avoid overwhelming OTel queue
  const result: TransformedEvent = {
    "@timestamp": doc.time,
    "@type": doc["@type"],
    id: doc.id,
  };

  // Add type-specific fields
  if (doc.deviceId) result.deviceId = doc.deviceId;
  if (doc.path) result.path = doc.path;

  // Enrich with device/room info from registry
  if (registry) {
    // For DeviceServiceData events - lookup by deviceId
    if (doc.deviceId && doc.deviceId in registry.devices) {
      const deviceInfo = registry.devices[doc.deviceId];
      result.device = { name: deviceInfo.name };
      if (deviceInfo.type) result.device.type = deviceInfo.type;

      // Get room from device's roomId
      if (deviceInfo.roomId && deviceInfo.roomId in registry.rooms) {
        result.room = {
          id: deviceInfo.roomId,
          name: registry.rooms[deviceInfo.roomId].name,
        };
      }
    }

    // For room events - lookup by id
    if (doc["@type"] === "room" && doc.id && doc.id in registry.rooms) {
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
  const entityId = doc.deviceId ?? doc.id ?? "unknown";
  // Include service id (e.g., HumidityLevel, TemperatureLevel) for full uniqueness
  const serviceId = doc.deviceId ? doc.id : undefined;
  const parts = [
    doc["@type"],
    entityId,
    serviceId,
    doc.time ?? String(Date.now()),
  ].filter(Boolean);
  return parts.join("-");
}

// Parse NDJSON line, handling pino's leading comma issue
function parseLine(line: string): SmartHomeEvent | null {
  if (!line || line.trim() === "") return null;
  try {
    // Handle pino's leading comma in output
    const cleanLine = line.startsWith("{,") ? "{" + line.slice(2) : line;
    return JSON.parse(cleanLine) as SmartHomeEvent;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(
      { linePreview: line.slice(0, 100), err: message },
      `Failed to parse line: ${message}`,
    );
    return null;
  }
}

interface ImportResponse {
  success: boolean;
  successCount: number;
  errors?: {
    type: string;
    id: string;
    error: { type: string; reason: string };
  }[];
}

interface SavedObjectReference {
  type: string;
  id: string;
  name: string;
}

interface SavedObjectAttributes {
  title?: string;
  name?: string;
  [key: string]: unknown;
}

interface SavedObject {
  type: string;
  id: string;
  attributes?: SavedObjectAttributes;
  references?: SavedObjectReference[];
  // Export metadata line has different structure
  exportedCount?: number;
  missingRefCount?: number;
  [key: string]: unknown;
}

function prefixSavedObjectIds(ndjson: string, prefix: string): string {
  const lines = ndjson.trim().split("\n");
  const prefixedLines: string[] = [];

  for (const line of lines) {
    const obj = JSON.parse(line) as SavedObject;

    // Skip export metadata line (last line with exportedCount)
    if (obj.exportedCount !== undefined) {
      prefixedLines.push(line);
      continue;
    }

    // Prefix the object's own ID
    if (obj.id) {
      obj.id = `${prefix}-${obj.id}`;
    }

    // Prefix all reference IDs
    if (obj.references && Array.isArray(obj.references)) {
      for (const ref of obj.references) {
        ref.id = `${prefix}-${ref.id}`;
      }
    }

    // Prefix dashboard title to distinguish from other deployments
    if (obj.type === "dashboard" && obj.attributes?.title) {
      obj.attributes.title = prefix;
    }

    // Prefix index pattern name/title to match the prefixed indices
    if (obj.type === "index-pattern" && obj.attributes) {
      if (obj.attributes.title) {
        obj.attributes.title = `${prefix}-*`;
      }
      if (obj.attributes.name) {
        obj.attributes.name = prefix;
      }
    }

    prefixedLines.push(JSON.stringify(obj));
  }

  return prefixedLines.join("\n");
}

async function importDashboard(): Promise<void> {
  return withSpan(
    "import_dashboard",
    { [SpanAttributes.INDEX_NAME]: INDEX_PREFIX },
    async () => {
      if (!KIBANA_NODE) {
        log.info(
          "KIBANA_NODE not configured, skipping dashboard import. Set KIBANA_NODE to enable.",
        );
        return;
      }

      if (!existsSync(DASHBOARD_FILE)) {
        log.info(
          { dashboardFile: DASHBOARD_FILE },
          "Dashboard file not found, skipping import",
        );
        return;
      }

      log.info(
        {
          dashboardFile: DASHBOARD_FILE,
          kibanaNode: KIBANA_NODE,
          prefix: INDEX_PREFIX,
        },
        "Importing Kibana dashboard with prefixed IDs",
      );

      // Read and prefix all saved object IDs
      const fileContent = readFileSync(DASHBOARD_FILE, "utf-8");
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
      ].join("\r\n");

      const auth = Buffer.from(
        `${config.esUser}:${config.esPassword}`,
      ).toString("base64");

      const response = await tlsFetch(
        `${KIBANA_NODE}/api/saved_objects/_import?overwrite=true`,
        {
          method: "POST",
          headers: {
            "kbn-xsrf": "true",
            Authorization: `Basic ${auth}`,
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
          },
          body: formDataBody,
        },
      );

      if (!response.ok) {
        const text = await response.text();
        log.error(
          { status: response.status, body: text },
          `Dashboard import failed: HTTP ${String(response.status)}`,
        );
        return;
      }

      const result = (await response.json()) as ImportResponse;

      if (result.success) {
        log.info(
          { successCount: result.successCount, prefix: INDEX_PREFIX },
          "Dashboard imported successfully",
        );
      } else {
        log.error({ errors: result.errors }, "Dashboard import had errors");
      }
    },
  );
}

async function setup(): Promise<void> {
  return withSpan(
    "setup",
    { [SpanAttributes.INDEX_NAME]: INDEX_PREFIX },
    async () => {
      log.info("Setting up Elasticsearch pipeline and index template");

      // Create ingest pipeline
      log.info({ pipelineName: PIPELINE_NAME }, "Creating ingest pipeline");
      await client.ingest.putPipeline({
        id: PIPELINE_NAME,
        description: "Add event.ingested timestamp to smart home events",
        processors: [
          {
            set: {
              field: "event.ingested",
              value: "{{{_ingest.timestamp}}}",
            },
          },
        ],
      });
      log.info("Pipeline created successfully");

      // Create index template (applies to smart-home-events-* indices)
      log.info(
        { templateName: TEMPLATE_NAME, indexPattern: INDEX_PATTERN },
        "Creating index template",
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
              "@timestamp": { type: "date" },
              event: {
                properties: {
                  ingested: { type: "date" },
                },
              },
              "@type": { type: "keyword" },
              id: { type: "keyword" },
              deviceId: { type: "keyword" },
              path: { type: "keyword" },
              device: {
                properties: {
                  name: { type: "keyword" },
                  type: { type: "keyword" },
                },
              },
              room: {
                properties: {
                  id: { type: "keyword" },
                  name: { type: "keyword" },
                },
              },
              metric: {
                properties: {
                  name: { type: "keyword" },
                  value: { type: "float" },
                },
              },
            },
          },
        },
      });
      log.info(
        { indexPattern: INDEX_PATTERN },
        "Index template created. New indices will automatically use the template.",
      );

      // Import Kibana dashboard (if configured)
      await importDashboard();
    },
  );
}

async function bulkImportFile(filePath: string): Promise<number> {
  return withSpan(
    "bulk_import_file",
    {
      [SpanAttributes.FILE_PATH]: filePath,
    },
    async () => {
      const dateStr = extractDateFromFilename(filePath);
      const indexName = getIndexName(dateStr);
      log.info({ filePath, indexName }, "Importing file");

      const documents: { doc: TransformedEvent; id: string }[] = [];

      return new Promise<number>((resolve, reject) => {
        createReadStream(filePath)
          .pipe(split())
          .on("data", (line: string) => {
            const doc = parseLine(line);
            if (doc) {
              documents.push({
                doc: transformDoc(doc),
                id: generateDocId(doc),
              });
            }
          })
          .on("end", () => {
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
                  const errors = result.items.filter(
                    (item) => item.index?.error,
                  );
                  log.error(
                    {
                      errorCount: errors.length,
                      errors: errors
                        .slice(0, 3)
                        .map((item) => item.index?.error),
                    },
                    `Documents failed to index: ${String(errors.length)} error(s)`,
                  );
                }

                const indexed = result.items.filter(
                  (item) => !item.index?.error,
                ).length;
                log.info(
                  {
                    indexed,
                    indexName,
                    [SpanAttributes.DOCUMENTS_COUNT]: documents.length,
                    [SpanAttributes.INDEX_NAME]: indexName,
                  },
                  "Indexed documents",
                );
                resolve(indexed);
              })
              .catch((err: unknown) => {
                reject(err instanceof Error ? err : new Error(String(err)));
              });
          })
          .on("error", reject);
      });
    },
  );
}

async function batchImport(pattern?: string): Promise<void> {
  const globPattern = pattern
    ? pattern.includes("/")
      ? pattern
      : `${DATA_DIR}/${pattern}`
    : `${DATA_DIR}/events-*.ndjson`;

  log.info({ pattern: globPattern }, "Starting batch import");

  const files = await glob(globPattern);

  if (files.length === 0) {
    log.info({ dataDir: DATA_DIR }, "No NDJSON files found in data directory");
    return;
  }

  log.info({ fileCount: files.length }, "Found files to import");

  let totalIndexed = 0;
  for (const file of files.sort()) {
    const indexed = await bulkImportFile(file);
    totalIndexed += indexed;
  }

  log.info({ totalIndexed }, "Batch import complete");
}

function watchAndTail(): void {
  // Get current day's file
  const today = new Date().toISOString().split("T")[0];
  const todayFile = path.join(DATA_DIR, `events-${today}.ndjson`);
  const indexName = getIndexName(today);

  log.info(
    { filePath: todayFile, indexName },
    "Starting watch mode for current day's file",
  );

  let tail: Tail | null = null;

  // Watch specifically for today's file
  const watcher = chokidar.watch(todayFile, {
    persistent: true,
    ignoreInitial: false,
  });

  watcher.on("ready", () => {
    log.info("Watcher ready");
  });

  watcher.on("error", (err) => {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, `Watcher error: ${message}`);
  });

  watcher.on("add", (filePath) => {
    log.info({ filePath, indexName }, "Tailing file");

    tail = new Tail(filePath, { fromBeginning: false, follow: true });

    tail.on("line", (line: string) => {
      const doc = parseLine(line);
      if (!doc) return;

      const transformed = transformDoc(doc);
      client
        .index({
          index: indexName,
          id: generateDocId(doc),
          document: transformed,
        })
        .then(() => {
          log.debug(
            { eventType: doc["@type"], deviceId: doc.deviceId, indexName },
            "Indexed event",
          );
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          log.error({ err: message }, `Index error: ${message}`);
        });
    });

    tail.on("error", (err) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err: message, filePath }, `Tail error: ${message}`);
    });
  });

  watcher.on("unlink", (filePath) => {
    if (tail) {
      tail.unwatch();
      tail = null;
      log.info({ filePath }, "Stopped tailing file");
    }
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    log.info("Shutting down");
    void watcher.close();
    if (tail) {
      tail.unwatch();
    }
    process.exit(0);
  });

  log.info("Watch mode active. Press Ctrl+C to stop.");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Load device registry for enrichment (not needed for --setup)
  if (!args.includes("--setup")) {
    loadRegistry();
  }

  try {
    // Test connection
    await client.ping();
    log.info({ esNode: config.esNode }, "Connected to Elasticsearch");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.fatal(
      { err: message },
      `Failed to connect to Elasticsearch: ${message}`,
    );
    process.exit(1);
  }

  if (args.includes("--setup")) {
    await setup();
  } else if (args.includes("--watch")) {
    watchAndTail();
  } else {
    // Parse --pattern option
    const patternIndex = args.indexOf("--pattern");
    const pattern =
      patternIndex !== -1 && args[patternIndex + 1]
        ? args[patternIndex + 1]
        : undefined;
    await batchImport(pattern);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  log.fatal({ err: message }, `Fatal error: ${message}`);
  process.exit(1);
});
