/**
 * Device registry management for event enrichment.
 *
 * Loads and caches device/room metadata from registry file.
 * Provides lookups to enrich events with human-readable names.
 */

import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { getDataDir } from '../config';
import { createLogger, serializeError } from '../logger';
import { withSpan } from '../instrumentation';

const log = createLogger('ingest:registry');

/**
 * Device metadata from registry.
 */
export interface DeviceInfo {
  name: string;
  roomId?: string;
  type?: string;
}

/**
 * Room metadata from registry.
 */
export interface RoomInfo {
  name: string;
  iconId?: string;
}

/**
 * Complete device registry structure.
 */
export interface DeviceRegistry {
  fetchedAt: string;
  devices: Record<string, DeviceInfo>;
  rooms: Record<string, RoomInfo>;
}

/**
 * Gets registry file path.
 *
 * @returns Path to device-registry.json
 */
export function getRegistryFilePath(): string {
  return path.join(getDataDir(), 'device-registry.json');
}

// Singleton registry cache
let registry: DeviceRegistry | null = null;

/**
 * Loads device registry from file.
 *
 * Reads registry JSON file and caches in memory for fast lookups.
 * Logs warning if file doesn't exist or is invalid.
 * Safe to call multiple times - only loads once.
 *
 * @returns Device registry or null if not available
 */
export function loadDeviceRegistry(): DeviceRegistry | null {
  if (registry) {
    return registry;
  }

  return withSpan('load_registry', {}, () => {
    const registryFile = getRegistryFilePath();

    if (!existsSync(registryFile)) {
      log.warn(
        { 'file.path': registryFile },
        `Registry file not found at ${registryFile}. Run 'yarn registry' to generate it. Events will be indexed without device/room names.`,
      );
      return null;
    }

    try {
      const content = readFileSync(registryFile, 'utf-8');
      const parsed = JSON.parse(content) as DeviceRegistry;
      registry = parsed;
      const deviceCount = Object.keys(parsed.devices).length;
      const roomCount = Object.keys(parsed.rooms).length;
      log.info(
        { 'device.count': deviceCount, 'room.count': roomCount, fetchedAt: parsed.fetchedAt },
        `Loaded device registry: ${String(deviceCount)} devices, ${String(roomCount)} rooms (fetched at ${parsed.fetchedAt})`,
      );
      return registry;
    } catch (err) {
      log.warn(
        serializeError(err),
        'Failed to load device registry. Events will be indexed without device/room names.',
      );
      return null;
    }
  });
}

/**
 * Gets device information by ID.
 *
 * @param deviceId - Device identifier
 * @returns Device info or undefined if not found
 */
export function getDeviceInfo(deviceId: string): DeviceInfo | undefined {
  const reg = registry ?? loadDeviceRegistry();
  if (!reg) return undefined;
  return reg.devices[deviceId];
}

/**
 * Gets room information by ID.
 *
 * @param roomId - Room identifier
 * @returns Room info or undefined if not found
 */
export function getRoomInfo(roomId: string): RoomInfo | undefined {
  const reg = registry ?? loadDeviceRegistry();
  if (!reg) return undefined;
  return reg.rooms[roomId];
}

/**
 * Clears cached registry.
 *
 * Forces reload on next access. Useful for testing or hot-reload scenarios.
 */
export function clearRegistryCache(): void {
  registry = null;
}
