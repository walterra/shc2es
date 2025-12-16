/**
 * Kibana dashboard import functionality.
 *
 * Handles importing saved objects (dashboards, visualizations, index patterns)
 * with ID prefixing for multi-deployment support.
 */

import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { createLogger } from '../logger';
import { withSpan, SpanAttributes } from '../instrumentation';
import type {
  ImportResponse,
  ExportMetadata,
  KibanaSavedObject,
} from '../types/kibana-saved-objects';
import { isExportMetadata } from '../types/kibana-saved-objects';

const log = createLogger('ingest:dashboard');

/**
 * Gets dashboard directory path.
 *
 * @returns Path to dashboards directory
 */
export function getDashboardsDir(): string {
  return path.join(__dirname, '..', '..', 'dashboards');
}

/**
 * Gets dashboard file path.
 *
 * @returns Path to smart-home.ndjson dashboard file
 */
export function getDashboardFile(): string {
  return path.join(getDashboardsDir(), 'smart-home.ndjson');
}

/**
 * Prefixes saved object IDs for multi-deployment support.
 *
 * Adds prefix to all object IDs and references to prevent conflicts
 * when multiple deployments share the same Kibana instance.
 *
 * @param ndjson - NDJSON content from dashboard export
 * @param prefix - Prefix to add to IDs (e.g., index prefix)
 * @returns Prefixed NDJSON content
 */
export function prefixDashboardIds(ndjson: string, prefix: string): string {
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

/**
 * Configuration for Kibana dashboard import.
 */
export interface DashboardImportConfig {
  kibanaNode: string | undefined;
  indexPrefix: string;
  username: string;
  password: string;
  tlsFetch: typeof globalThis.fetch;
}

/**
 * Imports Kibana dashboard from NDJSON file.
 *
 * Reads dashboard file, prefixes all object IDs, and uploads to Kibana.
 * Skips import if Kibana is not configured or file doesn't exist.
 *
 * @param config - Dashboard import configuration
 * @returns Promise that resolves when import completes
 */
export async function importKibanaDashboard(config: DashboardImportConfig): Promise<void> {
  const { kibanaNode, indexPrefix, username, password, tlsFetch } = config;
  return withSpan('import_dashboard', { [SpanAttributes.INDEX_NAME]: indexPrefix }, async () => {
    if (!kibanaNode) {
      log.info(
        'KIBANA_NODE not configured, skipping dashboard import. Set KIBANA_NODE environment variable to enable automatic dashboard setup.',
      );
      return;
    }

    const dashboardFile = getDashboardFile();
    if (!existsSync(dashboardFile)) {
      log.info(
        { 'file.path': dashboardFile },
        `Dashboard file not found at ${dashboardFile}, skipping import`,
      );
      return;
    }

    log.info(
      {
        'file.path': dashboardFile,
        'url.full': kibanaNode,
        prefix: indexPrefix,
      },
      `Importing Kibana dashboard from ${dashboardFile} to ${kibanaNode} with prefix '${indexPrefix}'`,
    );

    // Read and prefix all saved object IDs
    const fileContent = readFileSync(dashboardFile, 'utf-8');
    const prefixedContent = prefixDashboardIds(fileContent, indexPrefix);

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

    const auth = Buffer.from(`${username}:${password}`).toString('base64');

    const response = await tlsFetch(`${kibanaNode}/api/saved_objects/_import?overwrite=true`, {
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
        { successCount: result.successCount, prefix: indexPrefix },
        `Dashboard imported successfully: ${String(result.successCount)} objects with prefix '${indexPrefix}'`,
      );
    } else {
      log.error(
        { errors: result.errors },
        `Dashboard import completed with errors: ${String(result.errors?.length ?? 0)} errors`,
      );
    }
  });
}
