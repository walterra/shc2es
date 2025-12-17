import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { Agent, fetch as undiciFetch } from 'undici';

import { createLogger } from './logger';
import { validateDashboardConfig } from './validation';
import type { DashboardConfig } from './validation';
import { withSpan, SpanAttributes } from './instrumentation';
import type {
  SavedObject,
  DashboardAttributes,
  FindResponse,
  ExportMetadata,
  KibanaSavedObject,
} from './types/kibana-saved-objects';
import { isExportMetadata } from './types/kibana-saved-objects';

const log = createLogger('export-dashboard');

// TLS configuration for fetch requests
interface TlsConfig {
  rejectUnauthorized?: boolean;
  ca?: Buffer;
}

// Build TLS config based on validated configuration
function buildTlsConfig(config: DashboardConfig): TlsConfig {
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
function createTlsFetch(config: DashboardConfig): typeof globalThis.fetch {
  const tlsConfig = buildTlsConfig(config);

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
const DASHBOARDS_DIR = path.join(__dirname, '..', 'dashboards');
const DEFAULT_DASHBOARD_NAME = 'smart-home';

function getAuthHeader(config: DashboardConfig): string {
  return `Basic ${Buffer.from(`${config.esUser}:${config.esPassword}`).toString('base64')}`;
}

// Fields to strip from exported objects for privacy
const SENSITIVE_FIELDS = ['created_by', 'updated_by', 'created_at', 'updated_at', 'version'];

function stripSensitiveMetadata(ndjson: string): string {
  return withSpan('strip_metadata', { 'fields.count': SENSITIVE_FIELDS.length }, () => {
    const lines = ndjson.trim().split('\n');
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

    return strippedLines.join('\n');
  });
}

async function findDashboardByName(
  name: string,
  config: DashboardConfig,
  tlsFetch: typeof globalThis.fetch,
): Promise<SavedObject<DashboardAttributes> | null> {
  return withSpan('find_dashboard', { [SpanAttributes.DASHBOARD_NAME]: name }, async () => {
    log.info(
      { 'dashboard.name': name, 'url.full': config.kibanaNode },
      `Searching for dashboard '${name}' in Kibana at ${config.kibanaNode}`,
    );

    const params = new URLSearchParams({
      type: 'dashboard',
      search: name,
      search_fields: 'title',
    });

    const response = await tlsFetch(
      `${config.kibanaNode}/api/saved_objects/_find?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'kbn-xsrf': 'true',
          Authorization: getAuthHeader(config),
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`Dashboard search failed with HTTP ${String(response.status)}`);
      log.fatal(
        { 'http.response.status_code': response.status, 'http.response.body': text },
        error.message,
      );
      throw error;
    }

    const result = (await response.json()) as FindResponse<DashboardAttributes>;

    if (result.total === 0) {
      log.warn({ 'dashboard.name': name }, `No dashboards found matching name '${name}'`);
      return null;
    }

    // Look for exact match first
    const exactMatch = result.saved_objects.find(
      (obj) => obj.attributes.title.toLowerCase() === name.toLowerCase(),
    );

    if (exactMatch) {
      log.info(
        { 'dashboard.id': exactMatch.id, 'dashboard.title': exactMatch.attributes.title },
        `Found exact match: '${exactMatch.attributes.title}' (${exactMatch.id})`,
      );
      return exactMatch;
    }

    // If no exact match, show all matches and use first one
    if (result.total > 1) {
      const matches = result.saved_objects.map((obj) => ({
        id: obj.id,
        title: obj.attributes.title,
      }));
      log.warn(
        { matches, 'dashboard.count': matches.length },
        `Multiple dashboards found matching '${name}', using first match`,
      );
    }

    const match = result.saved_objects[0];
    if (!match) {
      log.warn(`No dashboard found in results for '${name}'`);
      return null;
    }
    log.info(
      { 'dashboard.id': match.id, 'dashboard.title': match.attributes.title },
      `Using dashboard '${match.attributes.title}' (${match.id})`,
    );
    return match;
  });
}

async function listDashboards(
  config: DashboardConfig,
  tlsFetch: typeof globalThis.fetch,
): Promise<void> {
  log.info(
    { 'url.full': config.kibanaNode },
    `Listing all dashboards from Kibana at ${config.kibanaNode}`,
  );

  const params = new URLSearchParams({
    type: 'dashboard',
    per_page: '100',
  });

  const response = await tlsFetch(
    `${config.kibanaNode}/api/saved_objects/_find?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        'kbn-xsrf': 'true',
        Authorization: getAuthHeader(config),
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Dashboard list failed with HTTP ${String(response.status)}`);
    log.fatal(
      { 'http.response.status_code': response.status, 'http.response.body': text },
      error.message,
    );
    throw error;
  }

  const result = (await response.json()) as FindResponse<DashboardAttributes>;

  if (result.total === 0) {
    log.info(
      { 'url.full': config.kibanaNode },
      `No dashboards found in Kibana at ${config.kibanaNode}`,
    );
    return;
  }

  // User-facing CLI output
  // eslint-disable-next-line no-console
  console.log('\nAvailable dashboards:\n');
  for (const obj of result.saved_objects) {
    // eslint-disable-next-line no-console
    console.log(`  "${obj.attributes.title}" (id: ${obj.id})`);
  }
  // eslint-disable-next-line no-console
  console.log(`\nTotal: ${String(result.total)} dashboard(s)\n`);
}

/**
 * Fetch dashboard export from Kibana API
 * @param dashboardId - ID of the dashboard to export
 * @param config - Dashboard configuration
 * @param tlsFetch - Fetch function with TLS config
 * @returns Raw NDJSON string from Kibana export API
 */
async function fetchDashboardExport(
  dashboardId: string,
  config: DashboardConfig,
  tlsFetch: typeof globalThis.fetch,
): Promise<string> {
  const body = {
    objects: [{ type: 'dashboard', id: dashboardId }],
    includeReferencesDeep: true,
  };

  log.info(
    { 'url.full': config.kibanaNode, 'dashboard.id': dashboardId },
    `Exporting dashboard ${dashboardId} from Kibana at ${config.kibanaNode}`,
  );

  const response = await tlsFetch(`${config.kibanaNode}/api/saved_objects/_export`, {
    method: 'POST',
    headers: {
      'kbn-xsrf': 'true',
      'Content-Type': 'application/json',
      Authorization: getAuthHeader(config),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Export failed: HTTP ${String(response.status)}`);
    log.fatal({ status: response.status, body: text }, error.message);
    throw error;
  }

  return response.text();
}

/**
 * Parse and validate dashboard export NDJSON
 * @param ndjson - Raw NDJSON from Kibana export
 * @returns Metadata about the export (object counts, missing refs, etc.)
 */
function parseDashboardExport(ndjson: string): ExportMetadata {
  const lines = ndjson.trim().split('\n');
  const objects = lines.map((line) => {
    const parsed: unknown = JSON.parse(line);
    return parsed as KibanaSavedObject | ExportMetadata;
  });

  // Last line is export metadata
  const lastObject = objects[objects.length - 1];
  if (!lastObject || !isExportMetadata(lastObject)) {
    const error = new Error('Export response missing metadata line');
    log.fatal(error.message);
    throw error;
  }

  const metadata = lastObject;
  const exportedObjects = objects.slice(0, -1) as KibanaSavedObject[];

  // Group by type for logging
  const typeCounts: Record<string, number> = {};
  for (const obj of exportedObjects) {
    const currentCount = typeCounts[obj.type];
    typeCounts[obj.type] = currentCount !== undefined ? currentCount + 1 : 1;
  }

  log.info(
    {
      typeCounts,
      'export.count': metadata.exportedCount,
      [SpanAttributes.OBJECTS_COUNT]: metadata.exportedCount,
    },
    `Export contains ${String(metadata.exportedCount)} objects: ${Object.entries(typeCounts)
      .map(([type, count]) => `${String(count)} ${type}(s)`)
      .join(', ')}`,
  );

  if (metadata.missingRefCount && metadata.missingRefCount > 0) {
    log.warn(
      { missingReferences: metadata.missingReferences, 'missing.count': metadata.missingRefCount },
      `Export has ${String(metadata.missingRefCount)} unresolved references`,
    );
  }

  return metadata;
}

/**
 * Save dashboard NDJSON to file with stripped metadata
 * @param ndjson - Raw NDJSON to save
 * @param outputName - Name of the output file (without .ndjson extension)
 * @param dashboardsDir - Optional directory override (defaults to DASHBOARDS_DIR)
 */
function saveDashboardFile(ndjson: string, outputName: string, dashboardsDir?: string): void {
  const outputDir = dashboardsDir ?? DASHBOARDS_DIR;

  // Ensure dashboards directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    log.info({ 'file.path': outputDir }, `Created dashboards directory at ${outputDir}`);
  }

  // Strip sensitive metadata before saving
  const strippedNdjson = stripSensitiveMetadata(ndjson);
  log.info(
    { 'field.names': SENSITIVE_FIELDS, 'field.count': SENSITIVE_FIELDS.length },
    `Stripped ${String(SENSITIVE_FIELDS.length)} sensitive metadata fields: ${SENSITIVE_FIELDS.join(', ')}`,
  );

  // Write to file
  const outputFile = path.join(outputDir, `${outputName}.ndjson`);
  writeFileSync(outputFile, strippedNdjson);
  log.info({ 'file.path': outputFile }, `Dashboard exported successfully to ${outputFile}`);
}

/**
 * Export a dashboard from Kibana and save to file
 * @param dashboardId - ID of the dashboard to export
 * @param outputName - Name for the output file
 * @param config - Dashboard configuration
 * @param tlsFetch - Fetch function with TLS config
 * @param dashboardsDir - Optional output directory override
 * @returns Promise that resolves when export is complete
 */
// eslint-disable-next-line max-params
async function exportDashboard(
  dashboardId: string,
  outputName: string,
  config: DashboardConfig,
  tlsFetch: typeof globalThis.fetch,
  dashboardsDir?: string,
): Promise<void> {
  return withSpan(
    'export_dashboard',
    {
      [SpanAttributes.DASHBOARD_ID]: dashboardId,
      [SpanAttributes.DASHBOARD_NAME]: outputName,
    },
    async () => {
      const ndjson = await fetchDashboardExport(dashboardId, config, tlsFetch);
      parseDashboardExport(ndjson);
      saveDashboardFile(ndjson, outputName, dashboardsDir);
    },
  );
}

/**
 * Print CLI usage information
 */
function printUsage(): void {
  // User-facing CLI output
  // eslint-disable-next-line no-console
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

/**
 * Dashboard context for dependency injection.
 *
 * Allows tests to inject mock configuration and fetch function while maintaining
 * backward compatibility with CLI usage (defaults to env vars and real fetch).
 */
export interface DashboardContext {
  /** Dashboard configuration (defaults to env vars) */
  config?: Partial<DashboardConfig>;
  /** Fetch function factory (defaults to createTlsFetch) */
  fetchFactory?: (config: DashboardConfig) => typeof globalThis.fetch;
  /** Command arguments (defaults to process.argv.slice(2)) */
  args?: string[];
  /** Output directory for dashboards (defaults to ./dashboards) */
  outputDir?: string;
}

/**
 * Main entry point for the dashboard export CLI
 * Handles command-line arguments and orchestrates dashboard operations
 * @param exit - Exit callback (defaults to process.exit for CLI, can be mocked for tests)
 * @param context - Optional dependency injection context for testing
 */
export async function main(
  exit: (code: number) => void = (code) => process.exit(code),
  context: DashboardContext = {},
): Promise<void> {
  // Env already loaded by cli.ts
  const args = context.args ?? process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    exit(0);
    return;
  }

  // Validate configuration (merge with injected config)
  const configResult = validateDashboardConfig();
  if (configResult.isErr()) {
    const error = configResult.error;
    log.fatal(
      { 'error.code': error.code, 'error.variable': error.variable },
      `Configuration validation failed: ${error.message}`,
    );
    exit(1);
    return;
  }
  const baseConfig = configResult.value;
  const config: DashboardConfig = { ...baseConfig, ...context.config };

  // Create TLS fetch with validated config (use factory if provided)
  const fetchFactory = context.fetchFactory ?? createTlsFetch;
  const tlsFetch = fetchFactory(config);

  if (args.includes('--list')) {
    try {
      await listDashboards(config, tlsFetch);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.fatal({ err: message }, `List dashboards failed: ${message}`);
      exit(1);
      return;
    }
    exit(0);
    return;
  }

  const dashboardName = args.join(' ');

  try {
    const dashboard = await findDashboardByName(dashboardName, config, tlsFetch);

    if (!dashboard) {
      log.info(`Dashboard '${dashboardName}' not found. Use --list to see available dashboards`);
      exit(1);
      return;
    }

    // Use hardcoded filename (template can be reused with different prefixes)
    await exportDashboard(
      dashboard.id,
      DEFAULT_DASHBOARD_NAME,
      config,
      tlsFetch,
      context.outputDir,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.fatal({ err: message }, `Export failed: ${message}`);
    exit(1);
  }
}

// Module exports functions - main() is called by cli.ts
// No auto-execution on import, keeping module side-effect free for tests
