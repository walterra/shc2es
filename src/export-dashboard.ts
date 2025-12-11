import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import * as path from 'path';
import { createLogger } from './logger';

// Disable TLS verification for self-signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const log = createLogger('export-dashboard');

// Environment validation
if (!process.env.KIBANA_NODE) {
  log.fatal('KIBANA_NODE must be set in .env');
  process.exit(1);
}

if (!process.env.ES_PASSWORD) {
  log.fatal('ES_PASSWORD must be set in .env (used for Kibana auth)');
  process.exit(1);
}

const KIBANA_NODE = process.env.KIBANA_NODE;
const ES_USER = process.env.ES_USER || 'elastic';
const ES_PASSWORD = process.env.ES_PASSWORD;
const DASHBOARDS_DIR = path.join(__dirname, '..', 'dashboards');
const OUTPUT_FILE = path.join(DASHBOARDS_DIR, 'smart-home.ndjson');

async function exportDashboard(dashboardId?: string): Promise<void> {
  // Ensure dashboards directory exists
  if (!existsSync(DASHBOARDS_DIR)) {
    mkdirSync(DASHBOARDS_DIR, { recursive: true });
    log.info({ dir: DASHBOARDS_DIR }, 'Created dashboards directory');
  }

  const auth = Buffer.from(`${ES_USER}:${ES_PASSWORD}`).toString('base64');

  // Build request body - either specific dashboard or all dashboards
  const body = dashboardId
    ? {
        objects: [{ type: 'dashboard', id: dashboardId }],
        includeReferencesDeep: true,
      }
    : {
        type: 'dashboard',
        includeReferencesDeep: true,
      };

  log.info(
    { kibanaNode: KIBANA_NODE, dashboardId: dashboardId || 'all' },
    'Exporting dashboard(s) from Kibana'
  );

  const response = await fetch(`${KIBANA_NODE}/api/saved_objects/_export`, {
    method: 'POST',
    headers: {
      'kbn-xsrf': 'true',
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    log.fatal({ status: response.status, body: text }, 'Export failed');
    process.exit(1);
  }

  const ndjson = await response.text();

  // Parse to count objects and validate
  const lines = ndjson.trim().split('\n');
  const objects = lines.map((line) => JSON.parse(line));

  // Last line is export metadata
  const metadata = objects[objects.length - 1];
  const exportedObjects = objects.slice(0, -1);

  // Group by type for logging
  const typeCounts: Record<string, number> = {};
  for (const obj of exportedObjects) {
    typeCounts[obj.type] = (typeCounts[obj.type] || 0) + 1;
  }

  log.info({ typeCounts, exportedCount: metadata.exportedCount }, 'Export summary');

  if (metadata.missingRefCount > 0) {
    log.warn(
      { missingReferences: metadata.missingReferences },
      'Some references could not be resolved'
    );
  }

  // Write to file
  writeFileSync(OUTPUT_FILE, ndjson);
  log.info({ outputFile: OUTPUT_FILE }, 'Dashboard exported successfully');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Optional: pass dashboard ID as argument
  const dashboardId = args[0];

  try {
    await exportDashboard(dashboardId);
  } catch (err) {
    log.fatal({ err }, 'Export failed');
    process.exit(1);
  }
}

main();
