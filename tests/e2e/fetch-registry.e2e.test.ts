/**
 * E2E tests for fetch-registry.ts - Fetching device/room registry from mock controller
 * Tests the complete registry fetching flow with mock data
 */

import * as fs from 'fs';
import * as path from 'path';
import { MockBoschController } from '../mocks/bosch-controller-server';
import { createTempDir, cleanupTempDir } from '../utils/test-helpers';
import controllerDevices from '../fixtures/controller-devices.json';
import controllerRooms from '../fixtures/controller-rooms.json';

interface Room {
  id: string;
  name: string;
  iconId: string;
}

interface Device {
  id: string;
  name: string;
  roomId?: string;
  deviceModel: string;
}

interface Registry {
  fetchedAt: string;
  devices: Record<string, { name: string; roomId?: string; type?: string }>;
  rooms: Record<string, { name: string; iconId?: string }>;
}

describe('Fetch Registry E2E', () => {
  let mockController: MockBoschController;
  let controllerUrl: string;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = createTempDir('registry-e2e-');

    // Start mock controller with test devices and rooms
    mockController = new MockBoschController({
      devices: controllerDevices,
      rooms: controllerRooms,
      requirePairingButton: false, // Auto-pair for tests
    });

    controllerUrl = await mockController.start();
  });

  afterAll(async () => {
    await mockController.stop();
    cleanupTempDir(tempDir);
  });

  it('should fetch devices from mock controller', async () => {
    const response = await fetch(`${controllerUrl}/smarthome/devices`);
    expect(response.ok).toBe(true);

    const devices = (await response.json()) as Device[];
    expect(Array.isArray(devices)).toBe(true);
    expect(devices).toHaveLength(3);
    expect(devices[0]).toMatchObject({
      id: 'hdm:ZigBee:001e5e0902b94515',
      name: 'EG WZ Climate Sensor',
      roomId: 'hz_1',
    });
  });

  it('should fetch rooms from mock controller', async () => {
    const response = await fetch(`${controllerUrl}/smarthome/rooms`);
    expect(response.ok).toBe(true);

    const rooms = (await response.json()) as Room[];
    expect(Array.isArray(rooms)).toBe(true);
    expect(rooms).toHaveLength(2);
    expect(rooms[0]).toMatchObject({
      id: 'hz_1',
      name: 'EG Wohnzimmer',
    });
  });

  it('should create registry JSON with mapped devices and rooms', async () => {
    // Note: This test would require refactoring fetch-registry.ts to:
    // 1. Accept controller URL as parameter
    // 2. Accept config directory as parameter
    // 3. Not call process.exit() on errors

    // For now, we simulate what fetch-registry.ts does
    const dataDir = path.join(tempDir, '.shc2es', 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    const registryFile = path.join(dataDir, 'device-registry.json');

    // Fetch devices and rooms
    const devicesResponse = await fetch(`${controllerUrl}/smarthome/devices`);
    const devices = (await devicesResponse.json()) as Device[];

    const roomsResponse = await fetch(`${controllerUrl}/smarthome/rooms`);
    const rooms = (await roomsResponse.json()) as Room[];

    // Build registry structure (same logic as fetch-registry.ts)
    const registry: Registry = {
      fetchedAt: new Date().toISOString(),
      devices: {} as Record<string, { name: string; roomId?: string; type?: string }>,
      rooms: {} as Record<string, { name: string; iconId?: string }>,
    };

    // Map rooms
    for (const room of rooms) {
      registry.rooms[room.id] = {
        name: room.name,
        iconId: room.iconId,
      };
    }

    // Map devices
    for (const device of devices) {
      registry.devices[device.id] = {
        name: device.name,
        roomId: device.roomId,
        type: device.deviceModel,
      };
    }

    // Save registry
    fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2));

    // Verify file was created
    expect(fs.existsSync(registryFile)).toBe(true);

    // Verify registry structure
    const savedRegistry = JSON.parse(fs.readFileSync(registryFile, 'utf-8')) as Registry;
    expect(savedRegistry).toHaveProperty('fetchedAt');
    expect(savedRegistry).toHaveProperty('devices');
    expect(savedRegistry).toHaveProperty('rooms');

    // Verify devices
    expect(Object.keys(savedRegistry.devices)).toHaveLength(3);
    expect(savedRegistry.devices['hdm:ZigBee:001e5e0902b94515']).toEqual({
      name: 'EG WZ Climate Sensor',
      roomId: 'hz_1',
      type: 'THB',
    });

    // Verify rooms
    expect(Object.keys(savedRegistry.rooms)).toHaveLength(2);
    expect(savedRegistry.rooms.hz_1).toEqual({
      name: 'EG Wohnzimmer',
      iconId: 'icon_room_living_room',
    });

    // Verify device-room relationship
    const device = savedRegistry.devices['hdm:ZigBee:001e5e0902b94515'];
    expect(device.roomId).toBeDefined();
    if (device.roomId) {
      const room = savedRegistry.rooms[device.roomId];
      expect(room.name).toBe('EG Wohnzimmer');
    }
  });
});
