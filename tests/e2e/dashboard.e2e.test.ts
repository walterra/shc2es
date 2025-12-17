/**
 * E2E tests for export-dashboard.ts - Dashboard import/export via Kibana API
 * Tests the complete dashboard workflow with real Kibana container
 *
 * Note: Containers started once in global setup for all E2E tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getGlobalContainers, createElasticsearchClient } from '../utils/global-containers';
import { createTempDir, cleanupTempDir } from '../utils/test-helpers';
import { main as dashboardMain } from '../../src/export-dashboard';
import type { Client } from '@elastic/elasticsearch';

interface SavedObject {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
}

describe('Dashboard E2E', () => {
  let esClient: Client;
  let kibanaUrl: string;
  let tempDir: string;
  const containers = getGlobalContainers();

  beforeAll(() => {
    esClient = createElasticsearchClient();
    kibanaUrl = containers.kibanaUrl;
  });

  beforeEach(() => {
    tempDir = createTempDir('dashboard-e2e-');
  });

  afterAll(async () => {
    await esClient.close();
  });

  // Note: Container readiness is validated in global-setup.e2e.ts
  // No need to test infrastructure availability - if containers weren't ready,
  // global setup would have failed before any tests run

  it('should call main() with --list to show available dashboards', async () => {
    // First import a dashboard so there's something to list
    const dashboardFile = path.join(__dirname, '../../dashboards/smart-home.ndjson');
    const content = fs.readFileSync(dashboardFile, 'utf-8');

    const formData = new FormData();
    const blob = new Blob([content], { type: 'application/ndjson' });
    formData.append('file', blob, 'dashboard.ndjson');

    await fetch(`${kibanaUrl}/api/saved_objects/_import?overwrite=true`, {
      method: 'POST',
      headers: {
        'kbn-xsrf': 'true',
      },
      body: formData,
    });

    // Setup environment variables (validation reads from process.env)
    const originalEnv = { ...process.env };
    process.env.KIBANA_NODE = kibanaUrl;
    process.env.ES_USER = 'elastic';
    process.env.ES_PASSWORD = 'changeme';
    process.env.ES_TLS_VERIFY = 'false';

    try {
      let exitCode: number | undefined;
      const mockExit = (code: number): void => {
        exitCode = code;
      };

      // Call main() with --list
      await dashboardMain(mockExit, {
        args: ['--list'],
      });

      // Should exit successfully
      expect(exitCode).toBe(0);
    } finally {
      // Restore environment
      process.env = originalEnv;
      cleanupTempDir(tempDir);
    }
  });

  it('should call main() to export dashboard from Kibana to NDJSON file', async () => {
    // First import a dashboard
    const dashboardFile = path.join(__dirname, '../../dashboards/smart-home.ndjson');
    const content = fs.readFileSync(dashboardFile, 'utf-8');

    const formData = new FormData();
    const blob = new Blob([content], { type: 'application/ndjson' });
    formData.append('file', blob, 'dashboard.ndjson');

    await fetch(`${kibanaUrl}/api/saved_objects/_import?overwrite=true`, {
      method: 'POST',
      headers: {
        'kbn-xsrf': 'true',
      },
      body: formData,
    });

    // Get dashboard name from imported file
    const lines = content.trim().split('\n');
    const objects = lines.map((line) => JSON.parse(line) as SavedObject);
    const dashboard = objects.find((obj) => obj.type === 'dashboard');
    const dashboardTitle = dashboard?.attributes?.title as string | undefined;
    expect(dashboardTitle).toBeDefined();

    // Setup export directory
    const dashboardsDir = path.join(tempDir, 'dashboards');
    fs.mkdirSync(dashboardsDir, { recursive: true });

    // Setup environment and working directory
    const originalEnv = { ...process.env };
    const originalCwd = process.cwd();
    process.env.KIBANA_NODE = kibanaUrl;
    process.env.ES_USER = 'elastic';
    process.env.ES_PASSWORD = 'changeme';
    process.env.ES_TLS_VERIFY = 'false';
    process.env.HOME = tempDir;
    process.chdir(tempDir);

    try {
      let exitCode: number | undefined;
      const mockExit = (code: number): void => {
        exitCode = code;
      };

      // Call main() to export dashboard
      if (!dashboardTitle) {
        throw new Error('Dashboard title not found');
      }

      await dashboardMain(mockExit, {
        args: [dashboardTitle],
        outputDir: dashboardsDir,
      });

      // Should exit successfully
      expect(exitCode).toBeUndefined();

      // Verify dashboard file was created
      const exportedFile = path.join(dashboardsDir, 'smart-home.ndjson');
      expect(fs.existsSync(exportedFile)).toBe(true);

      // Verify exported content is valid NDJSON
      const exportedContent = fs.readFileSync(exportedFile, 'utf-8');
      const exportedLines = exportedContent.trim().split('\n');
      expect(exportedLines.length).toBeGreaterThan(0);

      // Verify contains dashboard object
      const exportedObjects = exportedLines.map((line) => JSON.parse(line) as SavedObject);
      const exportedDashboard = exportedObjects.find((obj) => obj.type === 'dashboard');
      expect(exportedDashboard).toBeDefined();
    } finally {
      process.env = originalEnv;
      process.chdir(originalCwd);
      cleanupTempDir(tempDir);
    }
  }, 15000);

  it('should call main() and handle dashboard not found error', async () => {
    const originalEnv = { ...process.env };
    process.env.KIBANA_NODE = kibanaUrl;
    process.env.ES_USER = 'elastic';
    process.env.ES_PASSWORD = 'changeme';
    process.env.ES_TLS_VERIFY = 'false';

    try {
      let exitCode: number | undefined;
      const mockExit = (code: number): void => {
        exitCode = code;
      };

      // Call main() with non-existent dashboard name
      await dashboardMain(mockExit, {
        args: ['NonExistent Dashboard'],
      });

      // Should exit with error code
      expect(exitCode).toBe(1);
    } finally {
      process.env = originalEnv;
      cleanupTempDir(tempDir);
    }
  });

  it('should call main() with --help and exit successfully', async () => {
    const originalEnv = { ...process.env };
    process.env.KIBANA_NODE = kibanaUrl;
    process.env.ES_USER = 'elastic';
    process.env.ES_PASSWORD = 'changeme';
    process.env.ES_TLS_VERIFY = 'false';

    try {
      let exitCode: number | undefined;
      const mockExit = (code: number): void => {
        exitCode = code;
      };

      // Call main() with --help
      await dashboardMain(mockExit, {
        args: ['--help'],
      });

      // Should exit successfully
      expect(exitCode).toBe(0);
    } finally {
      process.env = originalEnv;
      cleanupTempDir(tempDir);
    }
  });
});
