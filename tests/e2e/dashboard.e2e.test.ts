/**
 * E2E tests for dashboard setup - Importing Kibana dashboard
 * Tests the complete dashboard import flow with Elasticsearch and Kibana containers
 *
 * Note: Containers started once in global setup for all E2E tests
 */

import * as fs from 'fs';
import * as path from 'path';
import { getGlobalContainers, createElasticsearchClient } from '../utils/global-containers';
import type { Client } from '@elastic/elasticsearch';

describe('Dashboard E2E', () => {
  let esClient: Client;
  let kibanaUrl: string;

  beforeAll(() => {
    const containers = getGlobalContainers();
    esClient = createElasticsearchClient();
    kibanaUrl = containers.kibanaUrl;
  });

  afterAll(async () => {
    await esClient.close();
  });

  it('should connect to Elasticsearch and Kibana successfully', async () => {
    // Verify Elasticsearch is running
    const esHealth = await esClient.cluster.health();
    expect(esHealth.status).toBeDefined();

    // Verify Kibana is running
    const kibanaResponse = await fetch(`${kibanaUrl}/api/status`);
    expect(kibanaResponse.ok).toBe(true);

    const status = await kibanaResponse.json();
    expect(status.status.overall.level).toBe('available');
  });

  it('should read dashboard NDJSON file', () => {
    const dashboardFile = path.join(__dirname, '../../dashboards/smart-home.ndjson');

    // Verify dashboard file exists
    expect(fs.existsSync(dashboardFile)).toBe(true);

    // Verify it's valid NDJSON
    const content = fs.readFileSync(dashboardFile, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines.length).toBeGreaterThan(0);

    // Parse each line to verify valid JSON
    const objects = lines.map((line) => JSON.parse(line));

    // Should contain saved object exports
    expect(objects.length).toBeGreaterThan(0);
    expect(objects[0]).toHaveProperty('type');
    expect(objects[0]).toHaveProperty('id');
  });

  it('should import dashboard into Kibana', async () => {
    const dashboardFile = path.join(__dirname, '../../dashboards/smart-home.ndjson');
    const content = fs.readFileSync(dashboardFile, 'utf-8');

    // Create FormData for multipart upload (Kibana requires this format)
    const formData = new FormData();
    const blob = new Blob([content], { type: 'application/ndjson' });
    formData.append('file', blob, 'dashboard.ndjson');

    // Import saved objects via Kibana API
    const importResponse = await fetch(`${kibanaUrl}/api/saved_objects/_import`, {
      method: 'POST',
      headers: {
        'kbn-xsrf': 'true',
        // Don't set Content-Type - FormData sets it automatically with boundary
      },
      body: formData,
    });

    if (!importResponse.ok) {
      const errorBody = await importResponse.text();
      console.error(`[Test] Import failed with body: ${errorBody}`);
    }

    expect(importResponse.ok).toBe(true);

    const importResult = await importResponse.json();
    expect(importResult.success).toBe(true);
    expect(importResult.successCount).toBeGreaterThan(0);
  });

  it('should verify dashboard exists in Kibana after import', async () => {
    // First import the dashboard
    const dashboardFile = path.join(__dirname, '../../dashboards/smart-home.ndjson');
    const content = fs.readFileSync(dashboardFile, 'utf-8');

    const formData = new FormData();
    const blob = new Blob([content], { type: 'application/ndjson' });
    formData.append('file', blob, 'dashboard.ndjson');

    await fetch(`${kibanaUrl}/api/saved_objects/_import`, {
      method: 'POST',
      headers: {
        'kbn-xsrf': 'true',
      },
      body: formData,
    });

    // Find dashboard objects from the NDJSON
    const lines = content.trim().split('\n');
    const objects = lines.map((line) => JSON.parse(line));
    const dashboards = objects.filter((obj) => obj.type === 'dashboard');

    expect(dashboards.length).toBeGreaterThan(0);

    // Query for the dashboard
    const dashboardId = dashboards[0].id;
    const findResponse = await fetch(`${kibanaUrl}/api/saved_objects/dashboard/${dashboardId}`, {
      headers: {
        'kbn-xsrf': 'true',
      },
    });

    expect(findResponse.ok).toBe(true);

    const dashboard = await findResponse.json();
    expect(dashboard.type).toBe('dashboard');
    expect(dashboard.id).toBe(dashboardId);
    expect(dashboard.attributes).toHaveProperty('title');
  });

  it('should handle dashboard re-import (overwrite)', async () => {
    const dashboardFile = path.join(__dirname, '../../dashboards/smart-home.ndjson');
    const content = fs.readFileSync(dashboardFile, 'utf-8');

    // First import
    const formData1 = new FormData();
    const blob1 = new Blob([content], { type: 'application/ndjson' });
    formData1.append('file', blob1, 'dashboard.ndjson');

    const firstImport = await fetch(`${kibanaUrl}/api/saved_objects/_import`, {
      method: 'POST',
      headers: {
        'kbn-xsrf': 'true',
      },
      body: formData1,
    });

    expect(firstImport.ok).toBe(true);

    // Second import with overwrite flag
    const formData2 = new FormData();
    const blob2 = new Blob([content], { type: 'application/ndjson' });
    formData2.append('file', blob2, 'dashboard.ndjson');

    const secondImport = await fetch(`${kibanaUrl}/api/saved_objects/_import?overwrite=true`, {
      method: 'POST',
      headers: {
        'kbn-xsrf': 'true',
      },
      body: formData2,
    });

    expect(secondImport.ok).toBe(true);

    const secondResult = await secondImport.json();
    expect(secondResult.success).toBe(true);
    // Should show objects were overwritten, not created
    expect(secondResult.successCount).toBeGreaterThan(0);
  });

  it('should validate dashboard can be exported back', async () => {
    // First import the dashboard
    const dashboardFile = path.join(__dirname, '../../dashboards/smart-home.ndjson');
    const content = fs.readFileSync(dashboardFile, 'utf-8');

    const formData = new FormData();
    const blob = new Blob([content], { type: 'application/ndjson' });
    formData.append('file', blob, 'dashboard.ndjson');

    await fetch(`${kibanaUrl}/api/saved_objects/_import`, {
      method: 'POST',
      headers: {
        'kbn-xsrf': 'true',
      },
      body: formData,
    });

    // Find dashboard ID
    const lines = content.trim().split('\n');
    const objects = lines.map((line) => JSON.parse(line));
    const dashboards = objects.filter((obj) => obj.type === 'dashboard');
    const dashboardId = dashboards[0].id;

    // Export the dashboard
    const exportResponse = await fetch(`${kibanaUrl}/api/saved_objects/_export`, {
      method: 'POST',
      headers: {
        'kbn-xsrf': 'true',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Use 'objects' to export specific dashboard (not 'type')
        objects: [{ type: 'dashboard', id: dashboardId }],
        includeReferencesDeep: true,
      }),
    });

    if (!exportResponse.ok) {
      const errorBody = await exportResponse.text();
      console.error(`[Test] Export failed with body: ${errorBody}`);
    }

    expect(exportResponse.ok).toBe(true);

    const exportedContent = await exportResponse.text();
    const exportedLines = exportedContent.trim().split('\n');
    const exportedObjects = exportedLines.map((line) => JSON.parse(line));

    // Should have at least the dashboard object
    expect(exportedObjects.length).toBeGreaterThan(0);

    // Find the exported dashboard
    const exportedDashboard = exportedObjects.find((obj) => obj.type === 'dashboard');
    expect(exportedDashboard).toBeDefined();
    expect(exportedDashboard?.id).toBe(dashboardId);
  });
});
