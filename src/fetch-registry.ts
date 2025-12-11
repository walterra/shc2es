import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { BoschSmartHomeBridgeBuilder } from 'bosch-smart-home-bridge';
import { firstValueFrom } from 'rxjs';
import { createLogger } from './logger';

const log = createLogger('registry');

const CONTROLLER_HOST = process.env.BSH_HOST;
const CLIENT_NAME = process.env.BSH_CLIENT_NAME || 'oss_bosch_smart_home_poll';
const CLIENT_ID = process.env.BSH_CLIENT_ID || 'oss_bosch_smart_home_poll_client';
const SYSTEM_PASSWORD = process.env.BSH_PASSWORD || '';

const CERT_PATH = path.join(__dirname, '..', 'certs');
const CERT_FILE = path.join(CERT_PATH, 'client-cert.pem');
const KEY_FILE = path.join(CERT_PATH, 'client-key.pem');
const REGISTRY_FILE = path.join(__dirname, '..', 'data', 'device-registry.json');

function loadCertificate(): { cert: string; key: string } {
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    return {
      cert: fs.readFileSync(CERT_FILE, 'utf-8'),
      key: fs.readFileSync(KEY_FILE, 'utf-8'),
    };
  }
  throw new Error('Certificate not found. Run yarn poll first to generate certificates.');
}

async function main(): Promise<void> {
  log.info('Fetching device and room registry from Bosch Smart Home Controller');

  if (!CONTROLLER_HOST) {
    log.fatal('BSH_HOST is required. Set it in .env file.');
    process.exit(1);
  }

  const { cert, key } = loadCertificate();

  const bshb = BoschSmartHomeBridgeBuilder.builder()
    .withHost(CONTROLLER_HOST)
    .withClientCert(cert)
    .withClientPrivateKey(key)
    .build();

  const client = bshb.getBshcClient();

  // Fetch devices
  log.info('Fetching devices...');
  const devicesResponse = await firstValueFrom(client.getDevices());
  const devices = devicesResponse.parsedResponse;
  log.info({ count: devices.length }, 'Devices fetched');

  // Fetch rooms
  log.info('Fetching rooms...');
  const roomsResponse = await firstValueFrom(client.getRooms());
  const rooms = roomsResponse.parsedResponse;
  log.info({ count: rooms.length }, 'Rooms fetched');

  // Build registry
  const registry = {
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
    log.debug({ roomId: room.id, roomName: room.name }, 'Room mapped');
  }

  // Map devices
  for (const device of devices) {
    registry.devices[device.id] = {
      name: device.name,
      roomId: device.roomId,
      type: device.deviceModel,
    };
    const roomName = device.roomId ? registry.rooms[device.roomId]?.name : 'no room';
    log.debug(
      {
        deviceId: device.id,
        deviceName: device.name,
        roomName,
        deviceType: device.deviceModel,
      },
      'Device mapped'
    );
  }

  // Save registry
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
  log.info({ registryFile: REGISTRY_FILE }, 'Registry saved');
}

main().catch((err) => {
  log.fatal({ err: err.message }, 'Error fetching registry');
  process.exit(1);
});
