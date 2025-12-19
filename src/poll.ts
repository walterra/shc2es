import * as fs from 'fs';
import type { BoschSmartHomeBridge } from 'bosch-smart-home-bridge';
import { BoschSmartHomeBridgeBuilder, BshbUtils } from 'bosch-smart-home-bridge';
import { getCertsDir, getCertFile, getKeyFile, getConfigPaths } from './config';
import { appLogger, dataLogger, BshbLogger, serializeError } from './logger';
import type { PollConfig } from './types/config';
import { withSpan, SpanAttributes } from './instrumentation';

/**
 * Factory function type for creating bridge instances
 * Allows tests to inject mock bridge implementations
 */
export type BridgeFactory = (host: string, cert: string, key: string) => BoschSmartHomeBridge;

/**
 * Context for polling operations
 * Groups optional dependencies to avoid parameter explosion
 */
interface PollingContext {
  /** Exit callback (CLI passes process.exit, tests pass mock) */
  exit: (code: number) => void;
  /** Optional AbortSignal to cancel polling */
  signal?: AbortSignal;
  /** Optional factory for creating bridge instances */
  bridgeFactory?: BridgeFactory;
}

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
      // Log raw event structure for investigation
      appLogger.debug(
        {
          'event.raw': eventObj,
          'event.keys': Object.keys(eventObj),
          'event.has_time': 'time' in eventObj,
          'event.has_timestamp': 'timestamp' in eventObj,
        },
        `Raw event from controller: @type=${String(eventObj['@type'])}`,
      );

      // Add timestamp to event (bridge events don't include this)
      const enrichedEvent = {
        ...eventObj,
        time: new Date().toISOString(),
      };

      // Log enriched event before writing to NDJSON
      appLogger.debug(
        {
          'event.enriched': enrichedEvent,
          'event.enriched_keys': Object.keys(enrichedEvent),
        },
        `Enriched event ready for NDJSON: @type=${String(eventObj['@type'])}`,
      );

      // Log to data file (NDJSON)
      dataLogger.info(enrichedEvent);
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
    // Log the batch summary
    appLogger.info(
      {
        'event.count': events.length,
        'event.batch_types': events
          .map((e) => (e as Record<string, unknown>)['@type'])
          .filter((t, i, arr) => arr.indexOf(t) === i), // unique types
      },
      `Processing batch of ${String(events.length)} events from controller`,
    );

    // Log first event in detail for investigation
    if (events.length > 0) {
      const firstEvent = events[0] as Record<string, unknown>;
      appLogger.debug(
        {
          'event.first_event': firstEvent,
          'event.structure': JSON.stringify(firstEvent, null, 2),
        },
        `First event in batch (for structure analysis)`,
      );
    }

    for (const event of events) {
      processEvent(event);
    }

    appLogger.info(
      { 'event.count': events.length },
      `Completed processing ${String(events.length)} events from controller`,
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
 * @param ctx - Polling context with exit callback, signal, and factory
 */
function handlePollingLoop(
  client: ReturnType<BoschSmartHomeBridge['getBshcClient']>,
  subscriptionId: string,
  bshb: BoschSmartHomeBridge,
  ctx: PollingContext,
): void {
  // Check if already aborted
  if (ctx.signal?.aborted) {
    appLogger.info('Polling aborted before starting');
    return;
  }

  const poll = (): void => {
    // Check abort signal before each poll
    if (ctx.signal?.aborted) {
      appLogger.info('Polling loop stopped via abort signal');
      return;
    }

    // Don't instrument the polling loop itself - it's recursive and would create nested spans
    // Auto-instrumentation already traces the HTTP long-poll requests
    client.longPolling(subscriptionId).subscribe({
      next: (pollResponse) => {
        // Log raw poll response for investigation
        appLogger.debug(
          {
            'poll.response': pollResponse,
            'poll.parsed_response': pollResponse.parsedResponse,
            'poll.result_type': typeof pollResponse.parsedResponse.result,
            'poll.result_is_array': Array.isArray(pollResponse.parsedResponse.result),
          },
          `Received long polling response`,
        );

        const events = pollResponse.parsedResponse.result as unknown[];
        processEvents(events);
        poll(); // Continue polling
      },
      error: (err: unknown) => {
        handleTransientError(err, () => {
          startPolling(bshb, ctx);
        });
      },
    });
  };

  poll();
}

/**
 * Subscribe to events and start polling
 * Helper for main() - handles subscription and error cases
 * @param client - BSHB client instance
 * @param bshb - Bridge instance for reconnection
 * @param ctx - Polling context with exit callback, signal, and factory
 */
function subscribeToEvents(
  client: ReturnType<BoschSmartHomeBridge['getBshcClient']>,
  bshb: BoschSmartHomeBridge,
  ctx: PollingContext,
): void {
  // Check if already aborted
  if (ctx.signal?.aborted) {
    appLogger.info('Subscription aborted before starting');
    return;
  }

  client.subscribe().subscribe({
    next: (response) => {
      const subscriptionId = response.parsedResponse.result;
      appLogger.info(
        { 'subscription.id': subscriptionId },
        `Subscribed successfully with ID ${subscriptionId}`,
      );
      appLogger.info('Starting long polling for smart home events (Ctrl+C to stop)');
      handlePollingLoop(client, subscriptionId, bshb, ctx);
    },
    error: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);

      if (isTransientError(message)) {
        appLogger.error(serializeError(err), `Subscription error (transient): ${message}`);
        handleTransientError(err, () => {
          startPolling(bshb, ctx);
        });
      } else {
        appLogger.fatal(serializeError(err), `Subscription error (fatal): ${message}`);
        ctx.exit(1);
      }
    },
  });
}

/**
 * Start long polling for smart home events
 * @param bshb - Bosch Smart Home Bridge instance
 * @param ctx - Polling context with exit callback, signal, and factory
 */
export function startPolling(bshb: BoschSmartHomeBridge, ctx: PollingContext): void {
  appLogger.info('Subscribing to smart home events from controller');
  const client = bshb.getBshcClient();
  subscribeToEvents(client, bshb, ctx);
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
 * Checks if error message indicates transient network error.
 * @param message - Error message to check
 * @returns True if error is transient and requires retry
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
 *
 * Configuration is validated in cli.ts and passed as a required parameter.
 *
 * @param exit - Exit callback (defaults to process.exit for CLI, can be mocked for tests)
 * @param config - Poll configuration (validated by cli.ts)
 * @param signal - Optional AbortSignal to cancel polling (for graceful shutdown)
 * @param bridgeFactory - Optional factory for creating bridge instances (for tests)
 */
export function main(
  exit: (code: number) => void = (code) => process.exit(code),
  config: PollConfig,
  signal?: AbortSignal,
  bridgeFactory: BridgeFactory = createBridge,
): void {
  // Create polling context to avoid parameter explosion
  const ctx: PollingContext = { exit, signal, bridgeFactory };

  // Check abort signal before starting
  if (signal?.aborted) {
    appLogger.info('Poll aborted before starting');
    return;
  }

  appLogger.info('Bosch Smart Home Long Polling Client starting');
  appLogger.info(getConfigPaths(), 'Using configuration paths');

  const { cert, key } = loadOrGenerateCertificate();

  appLogger.info({ 'host.ip': config.bshHost }, `Connecting to controller at ${config.bshHost}`);

  const bshb = bridgeFactory(config.bshHost, cert, key);

  appLogger.info('Checking pairing status with controller');

  bshb.pairIfNeeded(config.bshClientName, config.bshClientId, config.bshPassword).subscribe({
    next: () => {
      appLogger.info('Pairing successful or already paired with controller');
      startPolling(bshb, ctx);
    },
    error: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (isPairingButtonError(message)) {
        appLogger.warn('Press the pairing button on Controller II, then run again');
      } else {
        appLogger.fatal(serializeError(err), `Pairing error: ${message}`);
      }
      exit(1);
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
