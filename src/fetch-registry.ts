import * as fs from "fs";
import * as path from "path";
import { BoschSmartHomeBridgeBuilder } from "bosch-smart-home-bridge";
import type { BshcClient } from "bosch-smart-home-bridge/dist/api/bshc-client";
import { firstValueFrom } from "rxjs";
import { CERT_FILE, KEY_FILE, DATA_DIR } from "./config";
import { createLogger, logErrorAndExit } from "./logger";
import { validateRegistryConfig } from "./validation";
import { withSpan } from "./instrumentation";

const log = createLogger("registry");

// Validate configuration early
const configResult = validateRegistryConfig();
if (configResult.isErr()) {
  logErrorAndExit(
    configResult.error,
    `Configuration validation failed: ${configResult.error.message}`,
  );
}
// TypeScript now knows config is Ok
const config = configResult.value;

const CONTROLLER_HOST = config.bshHost;
const REGISTRY_FILE = path.join(DATA_DIR, "device-registry.json");

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
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    return {
      cert: fs.readFileSync(CERT_FILE, "utf-8"),
      key: fs.readFileSync(KEY_FILE, "utf-8"),
    };
  }
  throw new Error(
    "Certificate not found. Run yarn poll first to generate certificates.",
  );
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
  const devices = await withSpan("fetch_devices", {}, async () => {
    log.info("Fetching devices...");
    const devicesResponse = await firstValueFrom(client.getDevices());
    const devices = devicesResponse.parsedResponse as BshDevice[];
    log.info({ count: devices.length }, "Devices fetched");
    return devices;
  });

  // Fetch rooms
  const rooms = await withSpan("fetch_rooms", {}, async () => {
    log.info("Fetching rooms...");
    const roomsResponse = await firstValueFrom(client.getRooms());
    const rooms = roomsResponse.parsedResponse as BshRoom[];
    log.info({ count: rooms.length }, "Rooms fetched");
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
function buildRegistryData(
  devices: BshDevice[],
  rooms: BshRoom[],
): DeviceRegistry {
  return withSpan(
    "build_registry",
    {
      "devices.count": devices.length,
      "rooms.count": rooms.length,
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
        log.debug({ roomId: room.id, roomName: room.name }, "Room mapped");
      }

      // Map devices
      for (const device of devices) {
        registry.devices[device.id] = {
          name: device.name,
          roomId: device.roomId,
          type: device.deviceModel,
        };
        const roomName = device.roomId
          ? (registry.rooms[device.roomId]?.name ?? "unknown room")
          : "no room";
        log.debug(
          {
            deviceId: device.id,
            deviceName: device.name,
            roomName,
            deviceType: device.deviceModel,
          },
          "Device mapped",
        );
      }

      return registry;
    },
  );
}

/**
 * Save registry to file
 * @param registry - Registry data to save
 */
function saveRegistry(registry: DeviceRegistry): void {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
  log.info({ registryFile: REGISTRY_FILE }, "Registry saved");
}

/**
 * Main entry point - orchestrates registry fetching and saving
 * @returns Promise that resolves when registry is saved
 */
async function main(): Promise<void> {
  log.info(
    "Fetching device and room registry from Bosch Smart Home Controller",
  );

  const { cert, key } = loadCertificate();

  const bshb = BoschSmartHomeBridgeBuilder.builder()
    .withHost(CONTROLLER_HOST)
    .withClientCert(cert)
    .withClientPrivateKey(key)
    .build();

  const client = bshb.getBshcClient();

  const { devices, rooms } = await fetchDevicesAndRooms(client);
  const registry = buildRegistryData(devices, rooms);
  saveRegistry(registry);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  log.fatal({ err: message }, `Error fetching registry: ${message}`);
  process.exit(1);
});
