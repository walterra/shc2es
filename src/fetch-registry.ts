import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  BoschSmartHomeBridgeBuilder,
  BshbUtils,
} from 'bosch-smart-home-bridge';
import { firstValueFrom } from 'rxjs';

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
  console.log('Fetching device and room registry from Bosch Smart Home Controller...\n');

  if (!CONTROLLER_HOST) {
    console.error('BSH_HOST is required. Set it in .env file.');
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
  console.log('Fetching devices...');
  const devicesResponse = await firstValueFrom(client.getDevices());
  const devices = devicesResponse.parsedResponse;
  console.log(`Found ${devices.length} devices\n`);

  // Fetch rooms
  console.log('Fetching rooms...');
  const roomsResponse = await firstValueFrom(client.getRooms());
  const rooms = roomsResponse.parsedResponse;
  console.log(`Found ${rooms.length} rooms\n`);

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
    console.log(`Room: ${room.id} -> "${room.name}"`);
  }

  console.log('');

  // Map devices
  for (const device of devices) {
    registry.devices[device.id] = {
      name: device.name,
      roomId: device.roomId,
      type: device.deviceModel,
    };
    const roomName = device.roomId ? registry.rooms[device.roomId]?.name : 'no room';
    console.log(`Device: ${device.id}`);
    console.log(`  Name: ${device.name}`);
    console.log(`  Room: ${roomName} (${device.roomId || 'none'})`);
    console.log(`  Type: ${device.deviceModel}`);
    console.log('');
  }

  // Save registry
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
  console.log(`\nRegistry saved to: ${REGISTRY_FILE}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
