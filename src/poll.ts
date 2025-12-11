import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  BoschSmartHomeBridge,
  BoschSmartHomeBridgeBuilder,
  BshbUtils,
} from 'bosch-smart-home-bridge';
import { appLogger, dataLogger, BshbLogger } from './logger';

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
    appLogger.debug({ certFile: CERT_FILE }, 'Loading existing certificate');
    return {
      cert: fs.readFileSync(CERT_FILE, 'utf-8'),
      key: fs.readFileSync(KEY_FILE, 'utf-8'),
    };
  }

  appLogger.info('Generating new client certificate');
  const generated = BshbUtils.generateClientCertificate();

  if (!fs.existsSync(CERT_PATH)) {
    fs.mkdirSync(CERT_PATH, { recursive: true });
  }

  fs.writeFileSync(CERT_FILE, generated.cert);
  fs.writeFileSync(KEY_FILE, generated.private);
  appLogger.info({ certPath: CERT_PATH }, 'Certificate saved');

  return { cert: generated.cert, key: generated.private };
}

function startPolling(bshb: BoschSmartHomeBridge): void {
  appLogger.info('Subscribing to events');

  const client = bshb.getBshcClient();

  client.subscribe().subscribe({
    next: (response) => {
      const subscriptionId = response.parsedResponse.result;
      appLogger.info({ subscriptionId }, 'Subscribed successfully');
      appLogger.info('Starting long polling (Ctrl+C to stop)');

      const poll = (): void => {
        client.longPolling(subscriptionId).subscribe({
          next: (pollResponse) => {
            const events = pollResponse.parsedResponse.result;

            if (events && events.length > 0) {
              for (const event of events) {
                // Log to data file (NDJSON)
                dataLogger.info(event);
                // Also log summary to app logger
                appLogger.debug(
                  { eventType: event['@type'], deviceId: event.deviceId },
                  'Event received'
                );
              }
              appLogger.info({ count: events.length }, 'Events processed');
            }

            // Continue polling
            poll();
          },
          error: (err) => {
            appLogger.error({ err: err.message }, 'Long polling error');
            appLogger.info('Reconnecting in 5 seconds');
            setTimeout(() => { startPolling(bshb); }, 5000);
          },
        });
      };

      poll();
    },
    error: (err) => {
      appLogger.fatal({ err: err.message }, 'Subscription error');
      process.exit(1);
    },
  });
}

function main(): void {
  appLogger.info('Bosch Smart Home Long Polling Client');

  if (!CONTROLLER_HOST) {
    appLogger.fatal('BSH_HOST is required. Set it in .env file or environment.');
    process.exit(1);
  }

  if (!SYSTEM_PASSWORD) {
    appLogger.fatal('BSH_PASSWORD is required for initial pairing. Set it in .env file.');
    process.exit(1);
  }

  const { cert, key } = loadOrGenerateCertificate();

  appLogger.info({ host: CONTROLLER_HOST }, 'Connecting to controller');

  const bshb = BoschSmartHomeBridgeBuilder.builder()
    .withHost(CONTROLLER_HOST)
    .withClientCert(cert)
    .withClientPrivateKey(key)
    .withLogger(new BshbLogger())
    .build();

  appLogger.info('Checking pairing status');

  bshb.pairIfNeeded(CLIENT_NAME, CLIENT_ID, SYSTEM_PASSWORD).subscribe({
    next: () => {
      appLogger.info('Pairing successful or already paired');
      startPolling(bshb);
    },
    error: (err) => {
      if (err.message?.includes('press the button')) {
        appLogger.warn('Press the pairing button on Controller II, then run again');
      } else {
        appLogger.fatal({ err: err.message }, 'Pairing error');
      }
      process.exit(1);
    },
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  appLogger.info('Shutting down');
  process.exit(0);
});

main();
