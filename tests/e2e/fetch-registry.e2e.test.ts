/**
 * E2E tests for fetch-registry.ts - Fetching device/room registry from mock controller
 * Tests the complete registry fetching flow with mock data
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { MockBoschController } from '../mocks/bosch-controller-server';
import { createTempDir, cleanupTempDir } from '../utils/test-helpers';
import { createMockBridgeFactory } from '../mocks/mock-bridge-adapter';
import { main as fetchRegistryMain } from '../../src/fetch-registry';
import type { RegistryConfig } from '../../src/validation';
import controllerDevices from '../fixtures/controller-devices.json';
import controllerRooms from '../fixtures/controller-rooms.json';

interface Registry {
  fetchedAt: string;
  devices: Record<string, { name: string; roomId?: string; type?: string }>;
  rooms: Record<string, { name: string; iconId?: string }>;
}

/**
 * Setup test environment with certificates
 */
function setupTestEnv(tempDir: string): { certsDir: string; dataDir: string } {
  const configDir = path.join(tempDir, '.shc2es');
  const certsDir = path.join(configDir, 'certs');
  const dataDir = path.join(configDir, 'data');

  fs.mkdirSync(certsDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  // Create dummy certificates (required by fetch-registry.ts)
  fs.writeFileSync(path.join(certsDir, 'client-cert.pem'), 'dummy-cert');
  fs.writeFileSync(path.join(certsDir, 'client-key.pem'), 'dummy-key');

  return { certsDir, dataDir };
}

describe('Fetch Registry E2E', () => {
  let mockController: MockBoschController;
  let controllerUrl: string;
  let tempDir: string;

  beforeAll(async () => {
    // Start mock controller with test devices and rooms
    mockController = new MockBoschController({
      devices: controllerDevices,
      rooms: controllerRooms,
      requirePairingButton: false, // Auto-pair for tests
    });

    controllerUrl = await mockController.start();
  });

  beforeEach(() => {
    tempDir = createTempDir('registry-e2e-');
  });

  afterAll(async () => {
    await mockController.stop();
  });

  it('should call main() and fetch registry from mock controller', async () => {
    const { dataDir } = setupTestEnv(tempDir);
    const registryFile = path.join(dataDir, 'device-registry.json');

    // Mock config
    const config: Partial<RegistryConfig> = {
      bshHost: new URL(controllerUrl).hostname,
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

      // Create mock bridge factory
      const mockBridgeFactory = createMockBridgeFactory({ controllerUrl });

      // Call actual main() function
      await fetchRegistryMain(mockExit, {
        config,
        bridgeFactory: mockBridgeFactory,
        outputFile: registryFile,
      });

      // Verify no exit was called
      expect(exitCode).toBeUndefined();

      // Verify registry file was created
      expect(fs.existsSync(registryFile)).toBe(true);

      // Verify registry structure
      const registry = JSON.parse(fs.readFileSync(registryFile, 'utf-8')) as Registry;
      expect(registry).toHaveProperty('fetchedAt');
      expect(registry).toHaveProperty('devices');
      expect(registry).toHaveProperty('rooms');

      // Verify devices
      expect(Object.keys(registry.devices)).toHaveLength(3);
      expect(registry.devices['hdm:ZigBee:001e5e0902b94515']).toEqual({
        name: 'EG WZ Climate Sensor',
        roomId: 'hz_1',
        type: 'THB',
      });

      // Verify rooms
      expect(Object.keys(registry.rooms)).toHaveLength(2);
      expect(registry.rooms.hz_1).toEqual({
        name: 'EG Wohnzimmer',
        iconId: 'icon_room_living_room',
      });
    } finally {
      process.env.HOME = originalHome;
      cleanupTempDir(tempDir);
    }
  });

  it('should call main() and correctly map device-room relationships', async () => {
    const { dataDir } = setupTestEnv(tempDir);
    const registryFile = path.join(dataDir, 'device-registry.json');

    const config: Partial<RegistryConfig> = {
      bshHost: new URL(controllerUrl).hostname,
    };

    const originalHome = process.env.HOME;
    process.env.HOME = tempDir;

    try {
      let exitCode: number | undefined;
      const mockExit = (code: number): void => {
        exitCode = code;
      };

      const mockBridgeFactory = createMockBridgeFactory({ controllerUrl });

      // Call main()
      await fetchRegistryMain(mockExit, {
        config,
        bridgeFactory: mockBridgeFactory,
        outputFile: registryFile,
      });

      expect(exitCode).toBeUndefined();

      // Read registry
      const registry = JSON.parse(fs.readFileSync(registryFile, 'utf-8')) as Registry;

      // Verify device-room relationship
      const device = registry.devices['hdm:ZigBee:001e5e0902b94515'];
      expect(device).toBeDefined();
      expect(device.roomId).toBe('hz_1');

      // Verify room exists
      const room = registry.rooms.hz_1;
      expect(room).toBeDefined();
      expect(room.name).toBe('EG Wohnzimmer');
      expect(room.iconId).toBe('icon_room_living_room');

      // Verify all devices have correct metadata
      const allDevices = Object.values(registry.devices);
      expect(allDevices.every((d) => d.name && d.type)).toBe(true);

      // Verify timestamp
      expect(registry.fetchedAt).toBeDefined();
      const timestamp = new Date(registry.fetchedAt);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    } finally {
      process.env.HOME = originalHome;
      cleanupTempDir(tempDir);
    }
  });

  it('should call main() and handle devices without rooms', async () => {
    const { dataDir } = setupTestEnv(tempDir);
    const registryFile = path.join(dataDir, 'device-registry.json');

    const config: Partial<RegistryConfig> = {
      bshHost: new URL(controllerUrl).hostname,
    };

    const originalHome = process.env.HOME;
    process.env.HOME = tempDir;

    try {
      let exitCode: number | undefined;
      const mockExit = (code: number): void => {
        exitCode = code;
      };

      const mockBridgeFactory = createMockBridgeFactory({ controllerUrl });

      await fetchRegistryMain(mockExit, {
        config,
        bridgeFactory: mockBridgeFactory,
        outputFile: registryFile,
      });

      expect(exitCode).toBeUndefined();

      const registry = JSON.parse(fs.readFileSync(registryFile, 'utf-8')) as Registry;

      // Check for device without room (if fixture has one)
      const devicesWithoutRoom = Object.values(registry.devices).filter((d) => !d.roomId);

      // At minimum, verify the structure allows devices without rooms
      for (const device of devicesWithoutRoom) {
        expect(device.name).toBeDefined();
        expect(device.type).toBeDefined();
        expect(device.roomId).toBeUndefined();
      }
    } finally {
      process.env.HOME = originalHome;
      cleanupTempDir(tempDir);
    }
  });
});
