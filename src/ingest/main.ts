/**
 * Main entry point for ingest CLI.
 *
 * Orchestrates data ingestion workflows: setup, batch import, and watch mode.
 */

import type { Client } from '@elastic/elasticsearch';
import { createLogger, serializeError } from '../logger';
import { createElasticsearchClient, createKibanaFetch } from './config';
import { loadDeviceRegistry } from './registry';
import { setupElasticsearch } from './setup';
import { importKibanaDashboard } from './dashboard';
import { importFiles } from './bulk-import';
import { startWatchMode } from './watch';
import type { IngestConfig } from '../types/config';

const log = createLogger('ingest');

/**
 * Ingest context for dependency injection.
 *
 * Configuration is validated in cli.ts and passed as required parameter.
 * Tests inject mock configuration and clients.
 */
export interface IngestContext {
  /** Ingest configuration (validated by cli.ts) */
  config: IngestConfig;
  /** Elasticsearch client factory (defaults to createElasticsearchClient) */
  esClientFactory?: (config: IngestConfig) => Client;
  /** Kibana fetch factory (defaults to createKibanaFetch) */
  kibanaFetchFactory?: (config: IngestConfig) => typeof globalThis.fetch;
  /** Abort signal for graceful cancellation */
  signal?: AbortSignal;
  /** Command arguments (defaults to process.argv.slice(2)) */
  args?: string[];
}

/**
 * Main entry point for ingest CLI.
 *
 * Handles command-line arguments and orchestrates data ingestion:
 * - `--setup`: Create index template, pipeline, and import dashboard
 * - `--watch`: Real-time ingestion with file tailing
 * - `--pattern <glob>`: Batch import matching files (default: all events-*.ndjson)
 *
 * Configuration is validated in cli.ts and passed via context.
 *
 * @param exit - Exit callback (defaults to process.exit for CLI, can be mocked for tests)
 * @param context - Dependency injection context with validated config
 */
export async function main(
  exit: (code: number) => void = (code) => process.exit(code),
  context: IngestContext,
): Promise<void> {
  // Env already loaded by cli.ts
  const args = context.args ?? process.argv.slice(2);

  try {
    // Configuration is validated in cli.ts
    const config = context.config;

    // Create clients (use factories if provided, otherwise defaults)
    const esClientFactory = context.esClientFactory ?? createElasticsearchClient;
    const kibanaFetchFactory = context.kibanaFetchFactory ?? createKibanaFetch;
    const client = esClientFactory(config);
    const kibanaFetch = kibanaFetchFactory(config);

    // Load device registry for enrichment (not needed for --setup)
    if (!args.includes('--setup')) {
      loadDeviceRegistry();
    }

    // Test Elasticsearch connection
    try {
      await client.ping();
      log.info({ 'url.full': config.esNode }, `Connected to Elasticsearch at ${config.esNode}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to connect to Elasticsearch at ${config.esNode}: ${message}`);
    }

    // Execute requested operation
    if (args.includes('--setup')) {
      await setupElasticsearch(client, config.esIndexPrefix);
      await importKibanaDashboard({
        kibanaNode: config.kibanaNode,
        indexPrefix: config.esIndexPrefix,
        username: config.esUser,
        password: config.esPassword,
        tlsFetch: kibanaFetch,
      });
    } else if (args.includes('--watch')) {
      await startWatchMode(client, config.esIndexPrefix, context.signal);
    } else {
      // Parse --pattern option
      const patternIndex = args.indexOf('--pattern');
      const pattern =
        patternIndex !== -1 && args[patternIndex + 1] ? args[patternIndex + 1] : undefined;
      await importFiles(client, config.esIndexPrefix, pattern);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.fatal(serializeError(err), message);
    exit(1);
  }
}
