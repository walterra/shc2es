import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import * as path from "path";
import { Agent, fetch as undiciFetch } from "undici";
import "./config"; // Load env vars from ~/.shc2es/.env
import { createLogger } from "./logger";
import { validateDashboardConfig } from "./validation";
import { withSpan, SpanAttributes } from "./instrumentation";
import {
  SavedObject,
  DashboardAttributes,
  FindResponse,
  ExportMetadata,
  isExportMetadata,
  KibanaSavedObject,
} from "./types/kibana-saved-objects";

const log = createLogger("export-dashboard");

// Validate configuration early
const validatedConfig = validateDashboardConfig();
if (!validatedConfig) {
  process.exit(1);
}
// TypeScript now knows config is defined
const config = validatedConfig;

// TLS configuration for fetch requests
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

const KIBANA_NODE = config.kibanaNode;
const ES_USER = config.esUser;
const ES_PASSWORD = config.esPassword;
const DASHBOARDS_DIR = path.join(__dirname, "..", "dashboards");
const DEFAULT_DASHBOARD_NAME = "smart-home";

function getAuthHeader(): string {
  return `Basic ${Buffer.from(`${ES_USER}:${ES_PASSWORD}`).toString("base64")}`;
}

// Fields to strip from exported objects for privacy
const SENSITIVE_FIELDS = [
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
  "version",
];

function stripSensitiveMetadata(ndjson: string): string {
  return withSpan(
    "strip_metadata",
    { "fields.count": SENSITIVE_FIELDS.length },
    () => {
      const lines = ndjson.trim().split("\n");
      const strippedLines: string[] = [];

      for (const line of lines) {
        const obj = JSON.parse(line) as KibanaSavedObject | ExportMetadata;

        // Skip export metadata line (has exportedCount)
        if (isExportMetadata(obj)) {
          strippedLines.push(line);
          continue;
        }

        // Remove sensitive fields - create new object without them
        const stripped: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          if (!SENSITIVE_FIELDS.includes(key)) {
            stripped[key] = value;
          }
        }

        strippedLines.push(JSON.stringify(stripped));
      }

      return strippedLines.join("\n");
    },
  );
}

async function findDashboardByName(
  name: string,
): Promise<SavedObject<DashboardAttributes> | null> {
  return withSpan(
    "find_dashboard",
    { [SpanAttributes.DASHBOARD_NAME]: name },
    async () => {
      log.info({ name }, "Searching for dashboard by name");

      const params = new URLSearchParams({
        type: "dashboard",
        search: name,
        search_fields: "title",
      });

      const response = await tlsFetch(
        `${KIBANA_NODE}/api/saved_objects/_find?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "kbn-xsrf": "true",
            Authorization: getAuthHeader(),
          },
        },
      );

      if (!response.ok) {
        const text = await response.text();
        log.fatal(
          { status: response.status, body: text },
          `Search failed: HTTP ${String(response.status)}`,
        );
        process.exit(1);
      }

      const result =
        (await response.json()) as FindResponse<DashboardAttributes>;

      if (result.total === 0) {
        log.warn({ name }, "No dashboards found matching name");
        return null;
      }

      // Look for exact match first
      const exactMatch = result.saved_objects.find(
        (obj) => obj.attributes.title.toLowerCase() === name.toLowerCase(),
      );

      if (exactMatch) {
        log.info(
          { id: exactMatch.id, title: exactMatch.attributes.title },
          "Found exact match",
        );
        return exactMatch;
      }

      // If no exact match, show all matches and use first one
      if (result.total > 1) {
        const matches = result.saved_objects.map((obj) => ({
          id: obj.id,
          title: obj.attributes.title,
        }));
        log.warn({ matches }, "Multiple dashboards found, using first match");
      }

      const match = result.saved_objects[0];
      if (!match) {
        log.warn("No dashboard found in results");
        return null;
      }
      log.info(
        { id: match.id, title: match.attributes.title },
        "Using dashboard",
      );
      return match;
    },
  );
}

async function listDashboards(): Promise<void> {
  log.info("Listing all dashboards");

  const params = new URLSearchParams({
    type: "dashboard",
    per_page: "100",
  });

  const response = await tlsFetch(
    `${KIBANA_NODE}/api/saved_objects/_find?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "kbn-xsrf": "true",
        Authorization: getAuthHeader(),
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    log.fatal(
      { status: response.status, body: text },
      `List failed: HTTP ${String(response.status)}`,
    );
    process.exit(1);
  }

  const result = (await response.json()) as FindResponse<DashboardAttributes>;

  if (result.total === 0) {
    log.info("No dashboards found");
    return;
  }

  console.log("\nAvailable dashboards:\n");
  for (const obj of result.saved_objects) {
    console.log(`  "${obj.attributes.title}" (id: ${obj.id})`);
  }
  console.log(`\nTotal: ${String(result.total)} dashboard(s)\n`);
}

async function exportDashboard(
  dashboardId: string,
  outputName: string,
): Promise<void> {
  return withSpan(
    "export_dashboard",
    {
      [SpanAttributes.DASHBOARD_ID]: dashboardId,
      [SpanAttributes.DASHBOARD_NAME]: outputName,
    },
    async () => {
      // Ensure dashboards directory exists
      if (!existsSync(DASHBOARDS_DIR)) {
        mkdirSync(DASHBOARDS_DIR, { recursive: true });
        log.info({ dir: DASHBOARDS_DIR }, "Created dashboards directory");
      }

      const body = {
        objects: [{ type: "dashboard", id: dashboardId }],
        includeReferencesDeep: true,
      };

      log.info(
        { kibanaNode: KIBANA_NODE, dashboardId },
        "Exporting dashboard from Kibana",
      );

      const response = await tlsFetch(
        `${KIBANA_NODE}/api/saved_objects/_export`,
        {
          method: "POST",
          headers: {
            "kbn-xsrf": "true",
            "Content-Type": "application/json",
            Authorization: getAuthHeader(),
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        log.fatal(
          { status: response.status, body: text },
          `Export failed: HTTP ${String(response.status)}`,
        );
        process.exit(1);
      }

      const ndjson = await response.text();

      // Parse to count objects and validate
      const lines = ndjson.trim().split("\n");
      const objects = lines.map((line) => {
        const parsed: unknown = JSON.parse(line);
        return parsed as KibanaSavedObject | ExportMetadata;
      });

      // Last line is export metadata
      const lastObject = objects[objects.length - 1];
      if (!lastObject || !isExportMetadata(lastObject)) {
        log.fatal("Export response missing metadata line");
        process.exit(1);
      }

      const metadata = lastObject;
      const exportedObjects = objects.slice(0, -1) as KibanaSavedObject[];

      // Group by type for logging
      const typeCounts: Record<string, number> = {};
      for (const obj of exportedObjects) {
        const currentCount = typeCounts[obj.type];
        typeCounts[obj.type] =
          currentCount !== undefined ? currentCount + 1 : 1;
      }

      log.info(
        {
          typeCounts,
          exportedCount: metadata.exportedCount,
          [SpanAttributes.OBJECTS_COUNT]: metadata.exportedCount,
        },
        "Export summary",
      );

      if (metadata.missingRefCount && metadata.missingRefCount > 0) {
        log.warn(
          { missingReferences: metadata.missingReferences },
          "Some references could not be resolved",
        );
      }

      // Strip sensitive metadata before saving
      const strippedNdjson = stripSensitiveMetadata(ndjson);
      log.info(
        { strippedFields: SENSITIVE_FIELDS },
        "Stripped sensitive metadata",
      );

      // Write to file
      const outputFile = path.join(DASHBOARDS_DIR, `${outputName}.ndjson`);
      writeFileSync(outputFile, strippedNdjson);
      log.info({ outputFile }, "Dashboard exported successfully");
    },
  );
}

function printUsage(): void {
  console.log(`
Usage: yarn dashboard:export <dashboard-name>

Arguments:
  <dashboard-name>    Name (title) of the dashboard to export

Options:
  --list              List all available dashboards

Examples:
  yarn dashboard:export shc2es
  yarn dashboard:export "My Dashboard"
  yarn dashboard:export --list
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  if (args.includes("--list")) {
    await listDashboards();
    process.exit(0);
  }

  const dashboardName = args.join(" ");

  try {
    const dashboard = await findDashboardByName(dashboardName);

    if (!dashboard) {
      log.info("Use --list to see available dashboards");
      process.exit(1);
    }

    // Use hardcoded filename (template can be reused with different prefixes)
    await exportDashboard(dashboard.id, DEFAULT_DASHBOARD_NAME);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.fatal({ err: message }, `Export failed: ${message}`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  log.fatal({ err: message }, `Fatal error: ${message}`);
  process.exit(1);
});
