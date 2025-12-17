import * as fs from 'fs';
import * as path from 'path';
import { BoschSmartHomeBridgeBuilder } from 'bosch-smart-home-bridge';
import type { BoschSmartHomeBridge } from 'bosch-smart-home-bridge';
import type { BshcClient } from 'bosch-smart-home-bridge/dist/api/bshc-client';
import { firstValueFrom } from 'rxjs';
import { getCertFile, getKeyFile, getDataDir } from './config';
import { createLogger } from './logger';
import { validateRegistryConfig } from './validation';
import type { RegistryConfig } from './validation';
import { withSpan } from './instrumentation';

const log = createLogger('registry');

function getRegistryFile(): string {
  return path.join(getDataDir(), 'device-registry.json');
}

interface BshRoom {
  id: string;
  name: string;
  iconId?: string;
}

interface BshDevice {
  id: string;
  name: string;
  roomId?: string;
  deviceModel?: string;
}

interface DeviceRegistry {
  fetchedAt: string;
  devices: Record<string, { name: string; roomId?: string; type?: string }>;
  rooms: Record<string, { name: string; iconId?: string }>;
}

function loadCertificate(): { cert: string; key: string } {
  const certFile = getCertFile();
  const keyFile = getKeyFile();

  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    return {
      cert: fs.readFileSync(certFile, 'utf-8'),
      key: fs.readFileSync(keyFile, 'utf-8'),
    };
  }
  throw new Error('Certificate not found. Run yarn poll first to generate certificates.');
}

/**
 * Fetch devices and rooms from the Bosch Smart Home Controller
 * @param client - BSHB client instance
 * @returns Promise resolving to devices and rooms arrays
 */
async function fetchDevicesAndRooms(
  client: BshcClient,
): Promise<{ devices: BshDevice[]; rooms: BshRoom[] }> {
  // Fetch devices
  const devices = await withSpan('fetch_devices', {}, async () => {
    log.info('Fetching devices from controller...');
    const devicesResponse = await firstValueFrom(client.getDevices());
    const devices = devicesResponse.parsedResponse as BshDevice[];
    log.info(
      { 'device.count': devices.length },
      `Fetched ${String(devices.length)} devices from controller`,
    );
    return devices;
  });

  // Fetch rooms
  const rooms = await withSpan('fetch_rooms', {}, async () => {
    log.info('Fetching rooms from controller...');
    const roomsResponse = await firstValueFrom(client.getRooms());
    const rooms = roomsResponse.parsedResponse as BshRoom[];
    log.info(
      { 'room.count': rooms.length },
      `Fetched ${String(rooms.length)} rooms from controller`,
    );
    return rooms;
  });

  return { devices, rooms };
}

/**
 * Build registry data structure from devices and rooms
 * @param devices - Array of devices from API
 * @param rooms - Array of rooms from API
 * @returns Registry object with mapped devices and rooms
 */
function buildRegistryData(devices: BshDevice[], rooms: BshRoom[]): DeviceRegistry {
  return withSpan(
    'build_registry',
    {
      'devices.count': devices.length,
      'rooms.count': rooms.length,
    },
    () => {
      const registry: DeviceRegistry = {
        fetchedAt: new Date().toISOString(),
        devices: {},
        rooms: {},
      };

      // Map rooms
      for (const room of rooms) {
        registry.rooms[room.id] = {
          name: room.name,
          iconId: room.iconId,
        };
        log.debug(
          { 'room.id': room.id, 'room.name': room.name },
          `Mapped room: ${room.name} (${room.id})`,
        );
      }

      // Map devices
      for (const device of devices) {
        registry.devices[device.id] = {
          name: device.name,
          roomId: device.roomId,
          type: device.deviceModel,
        };
        const roomName = device.roomId
          ? (registry.rooms[device.roomId]?.name ?? 'unknown room')
          : 'no room';
        log.debug(
          {
            'device.id': device.id,
            'device.name': device.name,
            'room.name': roomName,
            'device.type': device.deviceModel,
          },
          `Mapped device: ${device.name} (${device.id}) in ${roomName}`,
        );
      }

      return registry;
    },
  );
}

/**
 * Save registry to file
 * @param registry - Registry data to save
 * @param registryFile - Optional file path override (for testing)
 */
function saveRegistry(registry: DeviceRegistry, registryFile?: string): void {
  const filePath = registryFile ?? getRegistryFile();
  fs.writeFileSync(filePath, JSON.stringify(registry, null, 2));
  log.info(
    {
      'file.path': filePath,
      'device.count': Object.keys(registry.devices).length,
      'room.count': Object.keys(registry.rooms).length,
    },
    `Registry saved to ${filePath}: ${String(Object.keys(registry.devices).length)} devices, ${String(Object.keys(registry.rooms).length)} rooms`,
  );
}

/**
 * Registry context for dependency injection.
 *
 * Allows tests to inject mock configuration and bridge while maintaining
 * backward compatibility with CLI usage (defaults to env vars and real bridge).
 */
export interface RegistryContext {
  /** Registry configuration (defaults to env vars) */
  config?: Partial<RegistryConfig>;
  /** Bridge factory (defaults to BoschSmartHomeBridgeBuilder) */
  bridgeFactory?: (host: string, cert: string, key: string) => BoschSmartHomeBridge;
  /** Output file path override (defaults to ~/.shc2es/data/device-registry.json) */
  outputFile?: string;
}

/**
 * Main entry point - orchestrates registry fetching and saving
 * @param exit - Exit callback (defaults to process.exit for CLI, can be mocked for tests)
 * @param context - Optional dependency injection context for testing
 * @returns Promise that resolves when registry is saved
 */
export async function main(
  exit: (code: number) => void = (code) => process.exit(code),
  context: RegistryContext = {},
): Promise<void> {
  // Validate configuration (env already loaded by cli.ts, merge with injected config)
  const configResult = validateRegistryConfig();
  if (configResult.isErr()) {
    const error = configResult.error;
    log.fatal(
      { 'error.code': error.code, 'error.variable': error.variable },
      `Configuration validation failed: ${error.message}`,
    );
    exit(1);
    return;
  }
  const baseConfig = configResult.value;
  const config: RegistryConfig = { ...baseConfig, ...context.config };

  log.info(
    `Fetching device and room registry from Bosch Smart Home Controller at ${config.bshHost}`,
  );

  const { cert, key } = loadCertificate();

  // Use bridge factory if provided, otherwise use default
  const bridgeFactory =
    context.bridgeFactory ??
    ((host: string, cert: string, key: string): BoschSmartHomeBridge =>
      BoschSmartHomeBridgeBuilder.builder()
        .withHost(host)
        .withClientCert(cert)
        .withClientPrivateKey(key)
        .build());

  const bshb = bridgeFactory(config.bshHost, cert, key);
  const client = bshb.getBshcClient();

  const { devices, rooms } = await fetchDevicesAndRooms(client);
  const registry = buildRegistryData(devices, rooms);
  saveRegistry(registry, context.outputFile);
}

// Module exports functions - main() is called by cli.ts
// No auto-execution on import, keeping module side-effect free for tests
