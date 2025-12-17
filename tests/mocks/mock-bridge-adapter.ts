/**
 * Mock Bridge Adapter for E2E Tests
 *
 * Provides a mock implementation of BoschSmartHomeBridge that talks to
 * MockBoschController instead of requiring HTTPS connection to real hardware.
 *
 * This adapter implements only the methods used by poll.ts:
 * - pairIfNeeded() - For initial pairing
 * - getBshcClient() - Returns mock client with subscribe/longPolling
 */

import { Observable } from 'rxjs';
import type { BoschSmartHomeBridge } from 'bosch-smart-home-bridge';
import type { BshbResponse } from 'bosch-smart-home-bridge/dist/bshb-response';
import type { BshcClient } from 'bosch-smart-home-bridge/dist/api/bshc-client';

/**
 * Configuration for mock bridge adapter
 */
export interface MockBridgeConfig {
  /** URL of MockBoschController (e.g., http://localhost:54321) */
  controllerUrl: string;
  /** Simulate pairing button not pressed */
  requirePairingButton?: boolean;
}

/**
 * Mock Bridge Adapter Factory
 * Creates a bridge factory function compatible with poll.ts
 *
 * @param config - Configuration with controller URL and options
 * @returns Factory function that creates mock bridge instances
 *
 * @example
 * ```typescript
 * const mockController = new MockBoschController();
 * const controllerUrl = await mockController.start();
 * const factory = createMockBridgeFactory({ controllerUrl });
 *
 * // Use with poll.ts
 * await pollMain(mockExit, config, signal, factory);
 * ```
 */
export function createMockBridgeFactory(
  config: MockBridgeConfig,
): (host: string, cert: string, key: string) => BoschSmartHomeBridge {
  return () => new MockBridgeAdapter(config);
}

/**
 * Mock implementation of BoschSmartHomeBridge
 * Connects to MockBoschController via HTTP instead of real controller via HTTPS
 */
class MockBridgeAdapter implements BoschSmartHomeBridge {
  private config: Required<MockBridgeConfig>;
  private client: MockBshcClient;

  constructor(config: MockBridgeConfig) {
    this.config = {
      controllerUrl: config.controllerUrl,
      requirePairingButton: config.requirePairingButton ?? false,
    };
    this.client = new MockBshcClient(this.config.controllerUrl);
  }

  /**
   * Mock pairing - calls MockBoschController's pairing endpoint
   */
  pairIfNeeded(
    name: string,
    identifier: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _systemPassword: string,
  ): Observable<BshbResponse<{ url: string; token: string } | undefined>> {
    return new Observable((observer) => {
      fetch(`${this.config.controllerUrl}/smarthome/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, id: identifier }),
      })
        .then(async (response) => {
          if (response.status === 401 && this.config.requirePairingButton) {
            observer.error(new Error('Please press the button on Controller II'));
            return;
          }

          if (!response.ok) {
            const error = await response.text();
            observer.error(new Error(`Pairing failed: ${error}`));
            return;
          }

          // Return mock response similar to real bridge
          observer.next({
            parsedResponse: undefined,
            incomingMessage: {} as never,
          } as BshbResponse<undefined>);
          observer.complete();
        })
        .catch((error: unknown) => {
          observer.error(error);
        });
    });
  }

  /**
   * Get mock BSHC client that talks to MockBoschController
   */
  getBshcClient(): BshcClient {
    return this.client as unknown as BshcClient;
  }
}

/**
 * Mock implementation of BshcClient
 * Implements methods used by poll.ts and fetch-registry.ts
 */
class MockBshcClient {
  private controllerUrl: string;

  constructor(controllerUrl: string) {
    this.controllerUrl = controllerUrl;
  }

  /**
   * Get devices from MockBoschController
   */
  getDevices(): Observable<BshbResponse<unknown[]>> {
    return new Observable((observer) => {
      fetch(`${this.controllerUrl}/smarthome/devices`)
        .then(async (response) => {
          if (!response.ok) {
            const error = await response.text();
            observer.error(new Error(`Get devices failed: ${error}`));
            return;
          }

          const devices = (await response.json()) as unknown[];
          observer.next({
            parsedResponse: devices,
            incomingMessage: {} as never,
          } as BshbResponse<unknown[]>);
          observer.complete();
        })
        .catch((error: unknown) => {
          observer.error(error);
        });
    });
  }

  /**
   * Get rooms from MockBoschController
   */
  getRooms(): Observable<BshbResponse<unknown[]>> {
    return new Observable((observer) => {
      fetch(`${this.controllerUrl}/smarthome/rooms`)
        .then(async (response) => {
          if (!response.ok) {
            const error = await response.text();
            observer.error(new Error(`Get rooms failed: ${error}`));
            return;
          }

          const rooms = (await response.json()) as unknown[];
          observer.next({
            parsedResponse: rooms,
            incomingMessage: {} as never,
          } as BshbResponse<unknown[]>);
          observer.complete();
        })
        .catch((error: unknown) => {
          observer.error(error);
        });
    });
  }

  /**
   * Subscribe to events via MockBoschController
   */
  subscribe(): Observable<BshbResponse<{ result: string; jsonrpc: string }>> {
    return new Observable((observer) => {
      fetch(`${this.controllerUrl}/remote/json-rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'RE/subscribe',
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            const error = await response.text();
            observer.error(new Error(`Subscription failed: ${error}`));
            return;
          }

          const data = (await response.json()) as { result: string; jsonrpc: string };
          observer.next({
            parsedResponse: data,
            incomingMessage: {} as never,
          } as BshbResponse<{ result: string; jsonrpc: string }>);
          observer.complete();
        })
        .catch((error: unknown) => {
          observer.error(error);
        });
    });
  }

  /**
   * Long polling via MockBoschController
   */
  longPolling(
    subscriptionId: string,
  ): Observable<BshbResponse<{ result: unknown[]; jsonrpc: string }>> {
    return new Observable((observer) => {
      // Add small delay to simulate async nature of long polling
      setTimeout(() => {
        fetch(`${this.controllerUrl}/remote/json-rpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'RE/longPoll',
            params: [subscriptionId],
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              const error = await response.text();
              observer.error(new Error(`Long polling failed: ${error}`));
              return;
            }

            const data = (await response.json()) as { result: unknown[]; jsonrpc: string };
            observer.next({
              parsedResponse: data,
              incomingMessage: {} as never,
            } as BshbResponse<{ result: unknown[]; jsonrpc: string }>);
            observer.complete();
          })
          .catch((error: unknown) => {
            observer.error(error);
          });
      }, 100); // Small delay to ensure async processing
    });
  }
}
