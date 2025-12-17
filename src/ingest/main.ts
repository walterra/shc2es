/**
 * Main entry point for ingest CLI.
 *
 * Orchestrates data ingestion workflows: setup, batch import, and watch mode.
 */

import { createLogger, serializeError } from '../logger';
import { getIngestConfig, createElasticsearchClient, createKibanaFetch } from './config';
import { loadDeviceRegistry } from './registry';
import { setupElasticsearch } from './setup';
import { importKibanaDashboard } from './dashboard';
import { importFiles } from './bulk-import';
import { startWatchMode } from './watch';

const log = createLogger('ingest');

/**
 * Main entry point for ingest CLI.
 *
 * Handles command-line arguments and orchestrates data ingestion:
 * - `--setup`: Create index template, pipeline, and import dashboard
 * - `--watch`: Real-time ingestion with file tailing
 * - `--pattern <glob>`: Batch import matching files (default: all events-*.ndjson)
 * @param exit - Exit callback (defaults to process.exit for CLI, can be mocked for tests)
 */
export async function main(
  exit: (code: number) => void = (code) => process.exit(code),
): Promise<void> {
  // Env already loaded by cli.ts
  const args = process.argv.slice(2);

  try {
    // Load configuration
    const requireKibana = args.includes('--setup');
    const config = getIngestConfig(requireKibana);
    const client = createElasticsearchClient(config);
    const kibanaFetch = createKibanaFetch(config);

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
      startWatchMode(client, config.esIndexPrefix);
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
