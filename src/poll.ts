import * as fs from "fs";
import {
  BoschSmartHomeBridge,
  BoschSmartHomeBridgeBuilder,
  BshbUtils,
} from "bosch-smart-home-bridge";
import { CERTS_DIR, CERT_FILE, KEY_FILE, getConfigPaths } from "./config";
import { appLogger, dataLogger, BshbLogger, logErrorAndExit } from "./logger";
import { validatePollConfig } from "./validation";
import { withSpan, SpanAttributes } from "./instrumentation";

// Import PollConfig type from validation
import type { PollConfig } from "./validation";

// Validate configuration
const configResult = validatePollConfig();
if (configResult.isErr()) {
  logErrorAndExit(
    configResult.error,
    `Configuration validation failed: ${configResult.error.message}`,
  );
}
const config: PollConfig = configResult.value;

/**
 * Load existing client certificate or generate a new one
 * @returns Certificate and private key pair
 */
export function loadOrGenerateCertificate(): { cert: string; key: string } {
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

/**
 * Process a single smart home event and log it
 * @param event - Smart home event to process
 */
export function processEvent(event: unknown): void {
  const eventObj = event as Record<string, unknown>;

  withSpan(
    "process_event",
    {
      [SpanAttributes.EVENT_TYPE]:
        typeof eventObj["@type"] === "string" ? eventObj["@type"] : "unknown",
      [SpanAttributes.DEVICE_ID]:
        typeof eventObj.deviceId === "string" ? eventObj.deviceId : "",
    },
    () => {
      // Log to data file (NDJSON)
      dataLogger.info(event);
      // Also log summary to app logger
      appLogger.debug(
        {
          eventType: eventObj["@type"],
          deviceId: eventObj.deviceId,
        },
        "Event received",
      );
    },
  );
}

/**
 * Process a batch of smart home events
 * @param events - Array of events to process
 */
export function processEvents(events: unknown[]): void {
  if (events.length === 0) return;

  withSpan(
    "process_events",
    { [SpanAttributes.EVENT_COUNT]: events.length },
    () => {
      for (const event of events) {
        processEvent(event);
      }
      appLogger.info({ count: events.length }, "Events processed");
    },
  );
}

/**
 * Start long polling for smart home events
 * @param bshb - Bosch Smart Home Bridge instance
 */
export function startPolling(bshb: BoschSmartHomeBridge): void {
  appLogger.info("Subscribing to events");

  const client = bshb.getBshcClient();

  client.subscribe().subscribe({
    next: (response) => {
      const subscriptionId = response.parsedResponse.result;
      appLogger.info({ subscriptionId }, "Subscribed successfully");
      appLogger.info("Starting long polling (Ctrl+C to stop)");

      const poll = (): void => {
        // Don't instrument the polling loop itself - it's recursive and would create nested spans
        // Auto-instrumentation already traces the HTTP long-poll requests
        client.longPolling(subscriptionId).subscribe({
          next: (pollResponse) => {
            const events = pollResponse.parsedResponse.result as unknown[];
            processEvents(events);
            poll(); // Continue polling
          },
          error: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            appLogger.error({ err: message }, `Long polling error: ${message}`);
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

      if (isTransientError(message)) {
        appLogger.error(
          { err: message },
          `Subscription error (transient): ${message}`,
        );
        appLogger.info("Reconnecting in 5 seconds");
        setTimeout(() => {
          startPolling(bshb);
        }, 5000);
      } else {
        appLogger.fatal(
          { err: message },
          `Subscription error (fatal): ${message}`,
        );
        process.exit(1);
      }
    },
  });
}

/**
 * Create a Bosch Smart Home Bridge instance
 * @param host - Controller IP address
 * @param cert - Client certificate
 * @param key - Client private key
 * @returns Configured bridge instance
 */
export function createBridge(
  host: string,
  cert: string,
  key: string,
): BoschSmartHomeBridge {
  return BoschSmartHomeBridgeBuilder.builder()
    .withHost(host)
    .withClientCert(cert)
    .withClientPrivateKey(key)
    .withLogger(new BshbLogger())
    .build();
}

/**
 * Check if an error message indicates a transient network error
 * @param message - Error message to check
 * @returns True if error is transient and should be retried
 */
export function isTransientError(message: string): boolean {
  return (
    message.includes("TIMEOUT") ||
    message.includes("ECONNRESET") ||
    message.includes("ENOTFOUND") ||
    message.includes("EHOSTUNREACH")
  );
}

/**
 * Check if an error message indicates pairing button needs to be pressed
 * @param message - Error message to check
 * @returns True if pairing button error
 */
export function isPairingButtonError(message: string): boolean {
  return message.includes("press the button");
}

/**
 * Main entry point for the polling client
 * Initializes connection, pairs if needed, and starts long polling loop
 */
export function main(): void {
  appLogger.info("Bosch Smart Home Long Polling Client");
  appLogger.info(getConfigPaths(), "Configuration");

  const { cert, key } = loadOrGenerateCertificate();

  appLogger.info({ host: config.bshHost }, "Connecting to controller");

  const bshb = createBridge(config.bshHost, cert, key);

  appLogger.info("Checking pairing status");

  bshb
    .pairIfNeeded(config.bshClientName, config.bshClientId, config.bshPassword)
    .subscribe({
      next: () => {
        appLogger.info("Pairing successful or already paired");
        startPolling(bshb);
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (isPairingButtonError(message)) {
          appLogger.warn(
            "Press the pairing button on Controller II, then run again",
          );
        } else {
          appLogger.fatal({ err: message }, `Pairing error: ${message}`);
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
