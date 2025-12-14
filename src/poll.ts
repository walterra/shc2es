import * as fs from "fs";
import {
  BoschSmartHomeBridge,
  BoschSmartHomeBridgeBuilder,
  BshbUtils,
} from "bosch-smart-home-bridge";
import { CERTS_DIR, CERT_FILE, KEY_FILE, getConfigPaths } from "./config";
import { appLogger, dataLogger, BshbLogger } from "./logger";
import { validatePollConfig, ValidationError } from "./validation";

// Validate configuration early
let config;
try {
  config = validatePollConfig();
} catch (err) {
  if (err instanceof ValidationError) {
    appLogger.fatal(err.message);
    process.exit(1);
  }
  throw err;
}

// Configuration from validated config
const CONTROLLER_HOST = config.bshHost;
const CLIENT_NAME = config.bshClientName;
const CLIENT_ID = config.bshClientId;
const SYSTEM_PASSWORD = config.bshPassword;

function loadOrGenerateCertificate(): { cert: string; key: string } {
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    appLogger.debug({ certFile: CERT_FILE }, "Loading existing certificate");
    return {
      cert: fs.readFileSync(CERT_FILE, "utf-8"),
      key: fs.readFileSync(KEY_FILE, "utf-8"),
    };
  }

  appLogger.info("Generating new client certificate");
  const generated = BshbUtils.generateClientCertificate();

  // CERTS_DIR is already created by ensureConfigDirs()
  fs.writeFileSync(CERT_FILE, generated.cert);
  fs.writeFileSync(KEY_FILE, generated.private);
  appLogger.info({ certPath: CERTS_DIR }, "Certificate saved");

  return { cert: generated.cert, key: generated.private };
}

function startPolling(bshb: BoschSmartHomeBridge): void {
  appLogger.info("Subscribing to events");

  const client = bshb.getBshcClient();

  client.subscribe().subscribe({
    next: (response) => {
      const subscriptionId = response.parsedResponse.result;
      appLogger.info({ subscriptionId }, "Subscribed successfully");
      appLogger.info("Starting long polling (Ctrl+C to stop)");

      const poll = (): void => {
        client.longPolling(subscriptionId).subscribe({
          next: (pollResponse) => {
            const events = pollResponse.parsedResponse.result as unknown[];

            if (events.length > 0) {
              for (const event of events) {
                // Log to data file (NDJSON)
                dataLogger.info(event);
                // Also log summary to app logger
                const eventObj = event as Record<string, unknown>;
                appLogger.debug(
                  { eventType: eventObj["@type"], deviceId: eventObj.deviceId },
                  "Event received",
                );
              }
              appLogger.info({ count: events.length }, "Events processed");
            }

            // Continue polling
            poll();
          },
          error: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            appLogger.error({ err: message }, "Long polling error");
            appLogger.info("Reconnecting in 5 seconds");
            setTimeout(() => {
              startPolling(bshb);
            }, 5000);
          },
        });
      };

      poll();
    },
    error: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      appLogger.fatal({ err: message }, "Subscription error");
      process.exit(1);
    },
  });
}

function main(): void {
  appLogger.info("Bosch Smart Home Long Polling Client");
  appLogger.info(getConfigPaths(), "Configuration");

  const { cert, key } = loadOrGenerateCertificate();

  appLogger.info({ host: CONTROLLER_HOST }, "Connecting to controller");

  const bshb = BoschSmartHomeBridgeBuilder.builder()
    .withHost(CONTROLLER_HOST)
    .withClientCert(cert)
    .withClientPrivateKey(key)
    .withLogger(new BshbLogger())
    .build();

  appLogger.info("Checking pairing status");

  bshb.pairIfNeeded(CLIENT_NAME, CLIENT_ID, SYSTEM_PASSWORD).subscribe({
    next: () => {
      appLogger.info("Pairing successful or already paired");
      startPolling(bshb);
    },
    error: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("press the button")) {
        appLogger.warn(
          "Press the pairing button on Controller II, then run again",
        );
      } else {
        appLogger.fatal({ err: message }, "Pairing error");
      }
      process.exit(1);
    },
  });
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  appLogger.info("Shutting down");
  process.exit(0);
});

main();
