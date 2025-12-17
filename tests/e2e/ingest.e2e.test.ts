/**
 * E2E tests for ingest.ts - Ingesting NDJSON files into Elasticsearch
 * Tests the complete data ingestion flow with real Elasticsearch container
 *
 * Note: Containers started once in global setup for all E2E tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { Client } from '@elastic/elasticsearch';
import { createElasticsearchClient, getGlobalContainers } from '../utils/global-containers';
import { createTempDir, cleanupTempDir } from '../utils/test-helpers';
import smartHomeEvents from '../fixtures/smart-home-events.json';
import { main as ingestMain } from '../../src/ingest/main';
import type { IngestConfig } from '../../src/validation';

interface SmartHomeEvent {
  '@type': string;
  '@timestamp'?: string;
  [key: string]: unknown;
}

/**
 * Setup test data directory with NDJSON event files
 */
function setupTestData(tempDir: string, date = '2025-12-17'): string {
  const dataDir = path.join(tempDir, '.shc2es', 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const testFile = path.join(dataDir, `events-${date}.ndjson`);
  const events = [
    smartHomeEvents.deviceServiceData,
    smartHomeEvents.deviceServiceDataWithFaults,
    smartHomeEvents.device,
    smartHomeEvents.room,
  ];

  // Write events as NDJSON
  const lines = events.map((event) => JSON.stringify(event)).join('\n');
  fs.writeFileSync(testFile, lines + '\n');

  return dataDir;
}

describe('Ingest E2E', () => {
  let esClient: Client;
  let tempDir: string;
  const containers = getGlobalContainers();

  beforeAll(() => {
    esClient = createElasticsearchClient();
  });

  beforeEach(() => {
    tempDir = createTempDir('ingest-e2e-');
  });

  afterAll(async () => {
    await esClient.close();
  });

  it('should call main() and batch import NDJSON files to Elasticsearch', async () => {
    // Setup test data
    setupTestData(tempDir, '2025-12-17');
    const indexName = 'test-ingest-batch-2025-12-17';

    // Mock config
    const config: Partial<IngestConfig> = {
      esNode: containers.elasticsearchUrl,
      esUser: 'elastic',
      esPassword: 'changeme',
      esIndexPrefix: 'test-ingest-batch',
      esTlsVerify: false,
    };

    // Override HOME to use temp directory
    const originalHome = process.env.HOME;
    process.env.HOME = tempDir;

    try {
      // Track exit calls
      let exitCode: number | undefined;
      const mockExit = (code: number): void => {
        exitCode = code;
      };

      // Call actual main() function with batch import (no args = default batch)
      await ingestMain(mockExit, {
        config,
        esClientFactory: () => esClient,
        args: [], // Default: batch import all events-*.ndjson
      });

      // Verify no exit was called
      expect(exitCode).toBeUndefined();

      // Wait for indexing to complete
      await esClient.indices.refresh({ index: indexName });

      // Verify documents were indexed
      const searchResponse = await esClient.search({
        index: indexName,
        body: {
          query: { match_all: {} },
          size: 100,
        },
      });

      expect(searchResponse.hits.total).toMatchObject({ value: 4 });
      expect(searchResponse.hits.hits).toHaveLength(4);

      // Verify event types
      const types = searchResponse.hits.hits.map((hit) => (hit._source as SmartHomeEvent)['@type']);
      expect(types).toContain('DeviceServiceData');
      expect(types).toContain('device');
      expect(types).toContain('room');
    } finally {
      process.env.HOME = originalHome;
      cleanupTempDir(tempDir);

      // Clean up test index
      await esClient.indices.delete({ index: indexName, ignore_unavailable: true });
    }
  }, 15000);

  it('should call main() with --pattern to import specific files', async () => {
    // Setup test data for multiple dates
    setupTestData(tempDir, '2025-12-15');
    setupTestData(tempDir, '2025-12-16');
    setupTestData(tempDir, '2025-12-17');

    const indexName = 'test-ingest-pattern-2025-12-16';

    // Mock config
    const config: Partial<IngestConfig> = {
      esNode: containers.elasticsearchUrl,
      esUser: 'elastic',
      esPassword: 'changeme',
      esIndexPrefix: 'test-ingest-pattern',
      esTlsVerify: false,
    };

    const originalHome = process.env.HOME;
    process.env.HOME = tempDir;

    try {
      let exitCode: number | undefined;
      const mockExit = (code: number): void => {
        exitCode = code;
      };

      // Call main() with --pattern to import only 2025-12-16
      await ingestMain(mockExit, {
        config,
        esClientFactory: () => esClient,
        args: ['--pattern', 'events-2025-12-16.ndjson'],
      });

      expect(exitCode).toBeUndefined();

      // Wait for indexing
      await esClient.indices.refresh({ index: indexName });

      // Verify only 2025-12-16 events were indexed
      const searchResponse = await esClient.search({
        index: indexName,
        body: {
          query: { match_all: {} },
        },
      });

      expect(searchResponse.hits.total).toMatchObject({ value: 4 });

      // Verify other dates were not indexed
      const idx15 = await esClient.indices.exists({
        index: 'test-ingest-pattern-2025-12-15',
      });
      const idx17 = await esClient.indices.exists({
        index: 'test-ingest-pattern-2025-12-17',
      });
      expect(idx15).toBe(false);
      expect(idx17).toBe(false);
    } finally {
      process.env.HOME = originalHome;
      cleanupTempDir(tempDir);

      // Clean up test indices (delete each date individually - wildcards not allowed)
      for (const date of ['2025-12-15', '2025-12-16', '2025-12-17']) {
        await esClient.indices.delete({ index: `test-ingest-pattern-${date}` }).catch(() => {
          /* ignore if not exists */
        });
      }
    }
  }, 15000);

  it('should call main() with --setup to create index template and dashboard', async () => {
    const indexPrefix = 'test-ingest-setup';

    const config: Partial<IngestConfig> = {
      esNode: containers.elasticsearchUrl,
      esUser: 'elastic',
      esPassword: 'changeme',
      esIndexPrefix: indexPrefix,
      esTlsVerify: false,
      kibanaNode: containers.kibanaUrl,
    };

    const originalHome = process.env.HOME;
    process.env.HOME = tempDir;

    try {
      let exitCode: number | undefined;
      const mockExit = (code: number): void => {
        exitCode = code;
      };

      // Call main() with --setup to create template and import dashboard
      await ingestMain(mockExit, {
        config,
        esClientFactory: () => esClient,
        args: ['--setup'],
      });

      expect(exitCode).toBeUndefined();

      // Verify index template was created
      const templates = await esClient.indices.getIndexTemplate({
        name: `${indexPrefix}-template`,
      });
      expect(templates.index_templates).toHaveLength(1);
      expect(templates.index_templates[0].name).toBe(`${indexPrefix}-template`);

      // Verify template has correct mappings
      const template = templates.index_templates[0];
      const mappings = template.index_template.template.mappings;
      expect(mappings?.properties?.['@timestamp']).toMatchObject({ type: 'date' });
      expect(mappings?.properties?.['@type']).toMatchObject({ type: 'keyword' });
      expect(mappings?.properties?.deviceId).toMatchObject({ type: 'keyword' });

      // Note: Dashboard import is tested in dashboard.e2e.test.ts
    } finally {
      process.env.HOME = originalHome;
      cleanupTempDir(tempDir);

      // Clean up template
      await esClient.indices
        .deleteIndexTemplate({
          name: `${indexPrefix}-template`,
        })
        .catch(() => {
          /* ignore if not exists */
        });
    }
  }, 15000);

  it('should call main() with --watch for real-time ingestion', async () => {
    // Create data file with initial event (matches real-world usage where poll.ts creates file first)
    const today = new Date().toISOString().split('T')[0] ?? '2025-12-17';
    const dataDir = path.join(tempDir, '.shc2es', 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const eventFile = path.join(dataDir, `events-${today}.ndjson`);

    // Write initial event (Tail library needs non-empty file to properly monitor)
    fs.writeFileSync(eventFile, JSON.stringify(smartHomeEvents.room) + '\n');

    const indexName = `test-ingest-watch-${today}`;

    const config: Partial<IngestConfig> = {
      esNode: containers.elasticsearchUrl,
      esUser: 'elastic',
      esPassword: 'changeme',
      esIndexPrefix: 'test-ingest-watch',
      esTlsVerify: false,
    };

    const originalHome = process.env.HOME;
    process.env.HOME = tempDir;

    try {
      let exitCode: number | undefined;
      const mockExit = (code: number): void => {
        exitCode = code;
      };

      // Start watch mode with abort signal
      const abortController = new AbortController();

      // Call main() with --watch (runs indefinitely until aborted)
      const watchPromise = ingestMain(mockExit, {
        config,
        esClientFactory: () => esClient,
        signal: abortController.signal,
        args: ['--watch'],
      });

      // Wait for watch mode to fully initialize (tail library needs time to start monitoring)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Append first event
      fs.appendFileSync(eventFile, JSON.stringify(smartHomeEvents.deviceServiceData) + '\n');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Append second event with unique deviceId for verification
      const testEvent = {
        '@type': 'DeviceServiceData',
        '@timestamp': new Date().toISOString(),
        deviceId: 'test-watch-device',
        id: 'TemperatureLevel',
        state: { temperature: 23.5 },
      };
      fs.appendFileSync(eventFile, JSON.stringify(testEvent) + '\n');

      // Wait for events to be indexed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Stop watch mode
      abortController.abort();
      await watchPromise;

      expect(exitCode).toBeUndefined();

      // Verify events were indexed in real-time
      await esClient.indices.refresh({ index: indexName });
      const searchResponse = await esClient.search({
        index: indexName,
        body: {
          query: { match_all: {} },
        },
      });

      // Should have 2 events (initial room event NOT indexed due to fromBeginning: false)
      expect(searchResponse.hits.total).toMatchObject({ value: 2 });

      // Verify new event was indexed (use match query - no index template in watch mode)
      const newEventQuery = await esClient.search({
        index: indexName,
        body: {
          query: {
            match: { deviceId: 'test-watch-device' },
          },
        },
      });
      expect(newEventQuery.hits.total).toMatchObject({ value: 1 });

      // Verify initial room event was NOT indexed (existed before watch started)
      const roomQuery = await esClient.search({
        index: indexName,
        body: {
          query: {
            term: { '@type': 'room' },
          },
        },
      });
      // Room should not be indexed since watch mode starts with fromBeginning: false
      expect(roomQuery.hits.total).toMatchObject({ value: 0 });
    } finally {
      process.env.HOME = originalHome;
      cleanupTempDir(tempDir);

      // Clean up test index
      await esClient.indices.delete({ index: indexName }).catch(() => {
        /* ignore if not exists */
      });
    }
  }, 20000);
});
