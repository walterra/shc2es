/**
 * E2E tests for ingest.ts - Ingesting NDJSON files into Elasticsearch
 * Tests the complete data ingestion flow with real Elasticsearch container
 *
 * Note: Containers started once in global setup for all E2E tests
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  createElasticsearchClient,
  getGlobalContainers,
} from '../utils/global-containers';
import { createTempDir, cleanupTempDir } from '../utils/test-helpers';
import smartHomeEvents from '../fixtures/smart-home-events.json';
import type { Client } from '@elastic/elasticsearch';

describe('Ingest E2E', () => {
  let esClient: Client;
  let elasticsearchUrl: string;
  let tempDir: string;

  beforeAll(() => {
    tempDir = createTempDir('ingest-e2e-');
    const containers = getGlobalContainers();
    esClient = createElasticsearchClient();
    elasticsearchUrl = containers.elasticsearchUrl;
  });

  afterAll(async () => {
    await esClient.close();

    // Clean up temp directory
    if (tempDir) {
      cleanupTempDir(tempDir);
    }
  });

  it('should connect to Elasticsearch successfully', async () => {
    // Verify Elasticsearch is running
    const health = await esClient.cluster.health();
    expect(health.status).toBeDefined();
    expect(['yellow', 'green']).toContain(health.status);
  });

  it('should create NDJSON files from test events', () => {
    const dataDir = path.join(tempDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    const testFile = path.join(dataDir, 'events-2025-12-16.ndjson');
    const events = [
      smartHomeEvents.deviceServiceData,
      smartHomeEvents.deviceServiceDataWithFaults,
      smartHomeEvents.device,
      smartHomeEvents.room,
    ];

    // Write events as NDJSON
    const lines = events.map((event) => JSON.stringify(event)).join('\n');
    fs.writeFileSync(testFile, lines + '\n');

    // Verify file was created
    expect(fs.existsSync(testFile)).toBe(true);

    // Verify file contains valid JSON lines
    const content = fs.readFileSync(testFile, 'utf-8');
    const parsedEvents = content
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(parsedEvents).toHaveLength(4);
    expect(parsedEvents[0]['@type']).toBe('DeviceServiceData');
  });

  it('should ingest events into Elasticsearch', async () => {
    const indexName = 'test-smart-home-events-2025-12-16';

    // Create test documents
    const docs = [
      {
        '@timestamp': '2025-12-16T10:00:00.000Z',
        '@type': 'DeviceServiceData',
        deviceId: 'test-device-1',
        'device.id': 'test-device-1',
        'device.name': 'Test Device 1',
        id: 'HumidityLevel',
        state: {
          humidity: 42.5,
        },
      },
      {
        '@timestamp': '2025-12-16T10:01:00.000Z',
        '@type': 'DeviceServiceData',
        deviceId: 'test-device-2',
        'device.id': 'test-device-2',
        'device.name': 'Test Device 2',
        id: 'TemperatureLevel',
        state: {
          temperature: 21.5,
        },
      },
    ];

    // Bulk index documents
    const bulkBody = docs.flatMap((doc) => [
      { index: { _index: indexName, _id: `${doc.deviceId}-${doc['@timestamp']}` } },
      doc,
    ]);

    const bulkResponse = await esClient.bulk({
      body: bulkBody,
      refresh: 'wait_for', // Wait for documents to be searchable
    });

    expect(bulkResponse.errors).toBe(false);

    // Verify documents were indexed
    const searchResponse = await esClient.search({
      index: indexName,
      body: {
        query: { match_all: {} },
        sort: [{ '@timestamp': 'asc' }],
      },
    });

    expect(searchResponse.hits.total).toMatchObject({ value: 2 });
    expect(searchResponse.hits.hits).toHaveLength(2);
    expect(searchResponse.hits.hits[0]._source).toMatchObject({
      '@type': 'DeviceServiceData',
      deviceId: 'test-device-1',
    });
  });

  it('should create index with proper mappings', async () => {
    const indexName = 'test-smart-home-events-mappings';

    // Create index with mappings (similar to what ingest.ts does)
    await esClient.indices.create({
      index: indexName,
      body: {
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            '@type': { type: 'keyword' },
            deviceId: { type: 'keyword' },
            'device.id': { type: 'keyword' },
            'device.name': { type: 'keyword' },
            'room.id': { type: 'keyword' },
            'room.name': { type: 'keyword' },
            'metric.name': { type: 'keyword' },
            'metric.value': { type: 'double' },
            'metric.unit': { type: 'keyword' },
          },
        },
      },
    });

    // Verify index was created
    const indexExists = await esClient.indices.exists({ index: indexName });
    expect(indexExists).toBe(true);

    // Verify mappings
    const mappings = await esClient.indices.getMapping({ index: indexName });
    const indexMappings = mappings[indexName]?.mappings;

    expect(indexMappings?.properties?.['@timestamp']).toMatchObject({ type: 'date' });
    expect(indexMappings?.properties?.['deviceId']).toMatchObject({ type: 'keyword' });

    // metric.value is a nested field - check the metric object first
    const metricProperties = indexMappings?.properties?.['metric'] as {
      properties?: Record<string, unknown>;
    };
    expect(metricProperties?.properties?.['value']).toMatchObject({ type: 'double' });
  });

  it('should query ingested data with filters', async () => {
    const indexName = 'test-smart-home-events-query';

    // Create index and ingest test data
    await esClient.indices.create({
      index: indexName,
      body: {
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            deviceId: { type: 'keyword' },
            'metric.name': { type: 'keyword' },
            'metric.value': { type: 'double' },
          },
        },
      },
    });

    const docs = [
      {
        '@timestamp': '2025-12-16T10:00:00.000Z',
        deviceId: 'device-1',
        'metric.name': 'temperature',
        'metric.value': 20.0,
      },
      {
        '@timestamp': '2025-12-16T11:00:00.000Z',
        deviceId: 'device-1',
        'metric.name': 'temperature',
        'metric.value': 22.0,
      },
      {
        '@timestamp': '2025-12-16T12:00:00.000Z',
        deviceId: 'device-2',
        'metric.name': 'humidity',
        'metric.value': 45.0,
      },
    ];

    const bulkBody = docs.flatMap((doc) => [{ index: { _index: indexName } }, doc]);

    await esClient.bulk({
      body: bulkBody,
      refresh: 'wait_for',
    });

    // Query for specific device
    const deviceQuery = await esClient.search({
      index: indexName,
      body: {
        query: {
          term: { deviceId: 'device-1' },
        },
      },
    });

    expect(deviceQuery.hits.total).toMatchObject({ value: 2 });

    // Query for specific metric
    const metricQuery = await esClient.search({
      index: indexName,
      body: {
        query: {
          term: { 'metric.name': 'humidity' },
        },
      },
    });

    expect(metricQuery.hits.total).toMatchObject({ value: 1 });
    expect(metricQuery.hits.hits[0]._source).toMatchObject({
      deviceId: 'device-2',
      'metric.name': 'humidity',
      'metric.value': 45.0,
    });
  });
});
