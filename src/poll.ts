import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  BoschSmartHomeBridge,
  BoschSmartHomeBridgeBuilder,
  BshbUtils,
} from 'bosch-smart-home-bridge';

// Configuration via .env file or environment variables
const CONTROLLER_HOST = process.env.BSH_HOST;
const CLIENT_NAME = process.env.BSH_CLIENT_NAME || 'oss_bosch_smart_home_poll';
const CLIENT_ID = process.env.BSH_CLIENT_ID || 'oss_bosch_smart_home_poll_client';
const SYSTEM_PASSWORD = process.env.BSH_PASSWORD || '';

const CERT_PATH = path.join(__dirname, '..', 'certs');
const CERT_FILE = path.join(CERT_PATH, 'client-cert.pem');
const KEY_FILE = path.join(CERT_PATH, 'client-key.pem');

function loadOrGenerateCertificate(): { cert: string; key: string } {
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    console.log('Loading existing certificate...');
    return {
      cert: fs.readFileSync(CERT_FILE, 'utf-8'),
      key: fs.readFileSync(KEY_FILE, 'utf-8'),
    };
  }

  console.log('Generating new client certificate...');
  const generated = BshbUtils.generateClientCertificate();

  if (!fs.existsSync(CERT_PATH)) {
    fs.mkdirSync(CERT_PATH, { recursive: true });
  }

  fs.writeFileSync(CERT_FILE, generated.cert);
  fs.writeFileSync(KEY_FILE, generated.private);
  console.log(`Certificate saved to ${CERT_PATH}`);

  return { cert: generated.cert, key: generated.private };
}

async function startPolling(bshb: BoschSmartHomeBridge): Promise<void> {
  console.log('Subscribing to events...');

  const client = bshb.getBshcClient();

  client.subscribe().subscribe({
    next: (response) => {
      const subscriptionId = response.parsedResponse.result;
      console.log(`Subscribed with ID: ${subscriptionId}`);
      console.log('Starting long polling... (Press Ctrl+C to stop)\n');

      const poll = (): void => {
        client.longPolling(subscriptionId).subscribe({
          next: (pollResponse) => {
            const events = pollResponse.parsedResponse.result;

            if (events && events.length > 0) {
              for (const event of events) {
                const timestamp = new Date().toISOString();
                console.log(`[${timestamp}]`, JSON.stringify(event, null, 2));
              }
            }

            // Continue polling
            poll();
          },
          error: (err) => {
            console.error('Long polling error:', err.message);
            console.log('Reconnecting in 5 seconds...');
            setTimeout(() => startPolling(bshb), 5000);
          },
        });
      };

      poll();
    },
    error: (err) => {
      console.error('Subscription error:', err.message);
      process.exit(1);
    },
  });
}

async function main(): Promise<void> {
  console.log('Bosch Smart Home Long Polling Client\n');

  if (!CONTROLLER_HOST) {
    console.error('Error: BSH_HOST is required. Set it in .env file or environment.');
    process.exit(1);
  }

  if (!SYSTEM_PASSWORD) {
    console.error('Error: BSH_PASSWORD is required for initial pairing. Set it in .env file.');
    process.exit(1);
  }

  const { cert, key } = loadOrGenerateCertificate();

  console.log(`Connecting to controller at ${CONTROLLER_HOST}...`);

  const bshb = BoschSmartHomeBridgeBuilder.builder()
    .withHost(CONTROLLER_HOST)
    .withClientCert(cert)
    .withClientPrivateKey(key)
    .build();

  console.log('Checking pairing status...');

  bshb.pairIfNeeded(CLIENT_NAME, CLIENT_ID, SYSTEM_PASSWORD).subscribe({
    next: () => {
      console.log('Pairing successful or already paired.\n');
      startPolling(bshb);
    },
    error: (err) => {
      if (err.message?.includes('press the button')) {
        console.log('\n>>> Please press the pairing button on your Controller II <<<\n');
        console.log('Then run this script again.');
      } else {
        console.error('Pairing error:', err.message);
      }
      process.exit(1);
    },
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  process.exit(0);
});

main();
