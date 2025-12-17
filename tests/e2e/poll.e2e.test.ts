/**
 * E2E tests for poll.ts - Long polling from mock controller to NDJSON files
 * Tests the complete data collection flow with a mock Bosch Smart Home Controller
 *
 * Note: Mock controller uses ephemeral port (0) to avoid conflicts with real controller
 */

import * as fs from 'fs';
import * as path from 'path';
import { MockBoschController } from '../mocks/bosch-controller-server';
import { createTempDir, cleanupTempDir } from '../utils/test-helpers';
import smartHomeEvents from '../fixtures/smart-home-events.json';
import type { SmartHomeEvent } from '../../src/types/smart-home-events';
import { main as pollMain } from '../../src/poll';

interface JsonRpcResponse {
  jsonrpc: string;
  result?: unknown;
  error?: { code: number; message: string };
}

// Mock environment variables for poll configuration
const setupTestEnv = (controllerUrl: string, tempDir: string): void => {
  const controllerHost = controllerUrl.replace('http://', '');
  process.env.BSH_HOST = controllerHost;
  process.env.BSH_PASSWORD = 'test-password';
  process.env.BSH_CLIENT_NAME = 'test-client';
  process.env.BSH_CLIENT_ID = 'test-id';
  process.env.HOME = tempDir; // Override home to use temp .shc2es directory
};

describe('Poll E2E', () => {
  let mockController: MockBoschController;
  let controllerUrl: string;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = createTempDir('poll-e2e-');

    // Start mock controller with test events
    const events = [smartHomeEvents.deviceServiceData, smartHomeEvents.deviceServiceDataWithFaults];

    mockController = new MockBoschController({
      events,
      requirePairingButton: false, // Auto-pair for tests
    });

    controllerUrl = await mockController.start();
  });

  afterAll(async () => {
    await mockController.stop();
    cleanupTempDir(tempDir);
  });

  beforeEach(() => {
    setupTestEnv(controllerUrl, tempDir);
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.BSH_HOST;
    delete process.env.BSH_PASSWORD;
    delete process.env.BSH_CLIENT_NAME;
    delete process.env.BSH_CLIENT_ID;
    delete process.env.HOME;
  });

  it('should connect to mock controller and receive events', async () => {
    // This is a basic connectivity test
    // Full integration with poll.ts would require refactoring poll.ts
    // to accept dependencies and not call process.exit()

    // For now, we verify the mock controller is working
    const response = await fetch(`${controllerUrl}/health`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toEqual({ status: 'ok' });
  });

  it('should support pairing flow', async () => {
    const response = await fetch(`${controllerUrl}/smarthome/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'test-client',
        id: 'test-id',
      }),
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toMatchObject({
      '@type': 'client',
      id: 'test-id',
      name: 'test-client',
    });
  });

  it('should support subscription and long polling', async () => {
    // Subscribe
    const subscribeResponse = await fetch(`${controllerUrl}/remote/json-rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'RE/subscribe',
      }),
    });

    expect(subscribeResponse.ok).toBe(true);
    const subscribeData = (await subscribeResponse.json()) as JsonRpcResponse;
    expect(subscribeData).toHaveProperty('result');
    const subscriptionId = subscribeData.result as string;

    // Long poll
    const pollResponse = await fetch(`${controllerUrl}/remote/json-rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'RE/longPoll',
        params: [subscriptionId],
      }),
    });

    expect(pollResponse.ok).toBe(true);
    const pollData = (await pollResponse.json()) as JsonRpcResponse;
    expect(pollData).toHaveProperty('result');
    const pollResult = pollData.result as SmartHomeEvent[];
    expect(Array.isArray(pollResult)).toBe(true);
    expect(pollResult).toHaveLength(2); // We added 2 events
  });

  it.skip('should write events to NDJSON when integrated - REPLACED BY NEXT TEST', () => {
    // This was a placeholder - now we have real integration below
  });

  it('should call main() with mock controller and write NDJSON files', async () => {
    // Setup directories
    const dataDir = path.join(tempDir, '.shc2es', 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    // Extract host from URL for config
    const host = controllerUrl.replace('http://', '');

    // Create config for poll.ts
    const config = {
      bshHost: host,
      bshPassword: 'test-password',
      bshClientName: 'test-client',
      bshClientId: 'test-id',
      logLevel: 'info' as const,
    };

    // Create AbortController to stop polling after receiving events
    const abortController = new AbortController();

    // Track exit calls
    let exitCode: number | undefined;
    const mockExit = (code: number): void => {
      exitCode = code;
    };

    // Start polling in background (it will run continuously)
    pollMain(mockExit, config, abortController.signal);

    // Wait for events to be written (give it a few seconds)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Abort polling
    abortController.abort();

    // Wait a bit for abort to take effect
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Find NDJSON files in data directory
    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.ndjson'));
    expect(files.length).toBeGreaterThan(0);

    // Read the most recent file
    const latestFile = files.sort().reverse()[0];
    const filePath = path.join(dataDir, latestFile);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Verify file contains events
    expect(content.trim().length).toBeGreaterThan(0);

    const events = content
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as SmartHomeEvent);

    // Should have received the 2 test events from mock controller
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]).toHaveProperty('@type');
    expect(events[0]).toMatchObject({
      '@type': 'DeviceServiceData',
    });

    // Should not have called exit with error
    expect(exitCode).toBeUndefined();
  }, 10000); // 10 second timeout for this integration test
});
