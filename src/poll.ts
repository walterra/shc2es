import * as fs from 'fs';
import type { BoschSmartHomeBridge } from 'bosch-smart-home-bridge';
import { BoschSmartHomeBridgeBuilder, BshbUtils } from 'bosch-smart-home-bridge';
import { getCertsDir, getCertFile, getKeyFile, getConfigPaths } from './config';
import { appLogger, dataLogger, BshbLogger, logErrorAndExit, serializeError } from './logger';
import { validatePollConfig } from './validation';
import { withSpan, SpanAttributes } from './instrumentation';

/**
 * Load existing client certificate or generate a new one
 * @returns Certificate and private key pair
 */
export function loadOrGenerateCertificate(): { cert: string; key: string } {
  const certFile = getCertFile();
  const keyFile = getKeyFile();

  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    appLogger.debug({ 'file.path': certFile }, `Loading existing certificate from ${certFile}`);
    return {
      cert: fs.readFileSync(certFile, 'utf-8'),
      key: fs.readFileSync(keyFile, 'utf-8'),
    };
  }

  appLogger.info('Generating new client certificate for controller authentication');
  const generated = BshbUtils.generateClientCertificate();

  // Certs directory is already created by ensureConfigDirs()
  fs.writeFileSync(certFile, generated.cert);
  fs.writeFileSync(keyFile, generated.private);
  appLogger.info({ 'file.path': getCertsDir() }, `Certificate saved to ${getCertsDir()}`);

  return { cert: generated.cert, key: generated.private };
}

/**
 * Process a single smart home event and log it
 * @param event - Smart home event to process
 */
export function processEvent(event: unknown): void {
  const eventObj = event as Record<string, unknown>;

  withSpan(
    'process_event',
    {
      [SpanAttributes.EVENT_TYPE]:
        typeof eventObj['@type'] === 'string' ? eventObj['@type'] : 'unknown',
      [SpanAttributes.DEVICE_ID]: typeof eventObj.deviceId === 'string' ? eventObj.deviceId : '',
    },
    () => {
      // Log to data file (NDJSON)
      dataLogger.info(event);
      // Also log summary to app logger
      appLogger.debug(
        {
          'event.type': eventObj['@type'],
          'device.id': eventObj.deviceId,
        },
        `Received ${String(eventObj['@type'])} event from device ${String(eventObj.deviceId)}`,
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

  withSpan('process_events', { [SpanAttributes.EVENT_COUNT]: events.length }, () => {
    for (const event of events) {
      processEvent(event);
    }
    appLogger.info(
      { 'event.count': events.length },
      `Processed ${String(events.length)} events from controller`,
    );
  });
}

/**
 * Handle transient errors with retry logic
 * @param error - Error to handle
 * @param retryCallback - Callback to execute after delay
 */
function handleTransientError(error: unknown, retryCallback: () => void): void {
  const message = error instanceof Error ? error.message : String(error);
  appLogger.error(serializeError(error), `Long polling error: ${message}`);
  appLogger.info('Reconnecting to controller in 5 seconds');
  setTimeout(retryCallback, 5000);
}

/**
 * Handle polling loop - recursively poll for events
 * @param client - BSHB client instance
 * @param subscriptionId - Subscription ID from initial subscribe
 * @param bshb - Bridge instance for reconnection
 */
function handlePollingLoop(
  client: ReturnType<BoschSmartHomeBridge['getBshcClient']>,
  subscriptionId: string,
  bshb: BoschSmartHomeBridge,
): void {
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
        handleTransientError(err, () => {
          startPolling(bshb);
        });
      },
    });
  };

  poll();
}

/**
 * Subscribe to events and start polling
 * @param client - BSHB client instance
 * @param bshb - Bridge instance for reconnection
 */
function subscribeToEvents(
  client: ReturnType<BoschSmartHomeBridge['getBshcClient']>,
  bshb: BoschSmartHomeBridge,
): void {
  client.subscribe().subscribe({
    next: (response) => {
      const subscriptionId = response.parsedResponse.result;
      appLogger.info(
        { 'subscription.id': subscriptionId },
        `Subscribed successfully with ID ${subscriptionId}`,
      );
      appLogger.info('Starting long polling for smart home events (Ctrl+C to stop)');
      handlePollingLoop(client, subscriptionId, bshb);
    },
    error: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);

      if (isTransientError(message)) {
        appLogger.error(serializeError(err), `Subscription error (transient): ${message}`);
        handleTransientError(err, () => {
          startPolling(bshb);
        });
      } else {
        appLogger.fatal(serializeError(err), `Subscription error (fatal): ${message}`);
        process.exit(1);
      }
    },
  });
}

/**
 * Start long polling for smart home events
 * @param bshb - Bosch Smart Home Bridge instance
 */
export function startPolling(bshb: BoschSmartHomeBridge): void {
  appLogger.info('Subscribing to smart home events from controller');
  const client = bshb.getBshcClient();
  subscribeToEvents(client, bshb);
}

/**
 * Create a Bosch Smart Home Bridge instance
 * @param host - Controller IP address
 * @param cert - Client certificate
 * @param key - Client private key
 * @returns Configured bridge instance
 */
export function createBridge(host: string, cert: string, key: string): BoschSmartHomeBridge {
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
    message.includes('TIMEOUT') ||
    message.includes('ECONNRESET') ||
    message.includes('ENOTFOUND') ||
    message.includes('EHOSTUNREACH')
  );
}

/**
 * Check if an error message indicates pairing button needs to be pressed
 * @param message - Error message to check
 * @returns True if pairing button error
 */
export function isPairingButtonError(message: string): boolean {
  return message.includes('press the button');
}

/**
 * Main entry point for the polling client
 * Initializes connection, pairs if needed, and starts long polling loop
 */
export function main(): void {
  // Validate configuration (env already loaded by cli.ts)
  const configResult = validatePollConfig();
  if (configResult.isErr()) {
    logErrorAndExit(
      configResult.error,
      `Configuration validation failed: ${configResult.error.message}`,
    );
  }
  const config = configResult.value;

  appLogger.info('Bosch Smart Home Long Polling Client starting');
  appLogger.info(getConfigPaths(), 'Using configuration paths');

  const { cert, key } = loadOrGenerateCertificate();

  appLogger.info({ 'host.ip': config.bshHost }, `Connecting to controller at ${config.bshHost}`);

  const bshb = createBridge(config.bshHost, cert, key);

  appLogger.info('Checking pairing status with controller');

  bshb.pairIfNeeded(config.bshClientName, config.bshClientId, config.bshPassword).subscribe({
    next: () => {
      appLogger.info('Pairing successful or already paired with controller');
      startPolling(bshb);
    },
    error: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (isPairingButtonError(message)) {
        appLogger.warn('Press the pairing button on Controller II, then run again');
      } else {
        appLogger.fatal(serializeError(err), `Pairing error: ${message}`);
      }
      process.exit(1);
    },
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  appLogger.info('Shutting down long polling client');
  process.exit(0);
});

// Module exports functions - main() is called by cli.ts
// No auto-execution on import, keeping module side-effect free for tests
