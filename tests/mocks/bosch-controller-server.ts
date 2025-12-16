/**
 * Mock Bosch Smart Home Controller II HTTP server for E2E tests
 * Implements the JSON-RPC API endpoints used by bosch-smart-home-bridge
 */

import express, { type Express, type Request, type Response } from 'express';
import type { Server } from 'http';
import type { SmartHomeEvent } from '../../src/types/smart-home-events';

/**
 * Configuration for the mock controller server
 */
export interface MockControllerConfig {
  /** Port to listen on (default: 0 = random ephemeral port to avoid conflicts) */
  port?: number;
  /** Events to serve via long polling (default: empty array) */
  events?: SmartHomeEvent[];
  /** Devices to serve via registry API (default: empty array) */
  devices?: BshDevice[];
  /** Rooms to serve via registry API (default: empty array) */
  rooms?: BshRoom[];
  /** Simulate pairing button not pressed (default: false) */
  requirePairingButton?: boolean;
  /** Delay for long polling response in ms (default: 0) */
  longPollingDelay?: number;
}

/**
 * Bosch Smart Home Room data structure
 */
export interface BshRoom {
  id: string;
  name: string;
  iconId?: string;
}

/**
 * Bosch Smart Home Device data structure
 */
export interface BshDevice {
  id: string;
  name: string;
  roomId?: string;
  deviceModel?: string;
  serial?: string;
  manufacturer?: string;
}

/**
 * Mock Bosch Smart Home Controller server
 * Provides HTTP endpoints that mimic the Controller II API
 *
 * Uses ephemeral ports by default (port: 0) to avoid conflicts with real controllers
 * or other test instances. Call start() to get the actual URL with port.
 */
export class MockBoschController {
  private app: Express;
  private server: Server | null = null;
  private config: Required<MockControllerConfig>;
  private subscriptions = new Map<string, { createdAt: Date }>();
  private eventQueue: SmartHomeEvent[] = [];
  private isPaired = false;

  constructor(config: MockControllerConfig = {}) {
    this.config = {
      port: config.port ?? 0, // 0 = random ephemeral port to avoid conflicts
      events: config.events ?? [],
      devices: config.devices ?? [],
      rooms: config.rooms ?? [],
      requirePairingButton: config.requirePairingButton ?? false,
      longPollingDelay: config.longPollingDelay ?? 0,
    };
    this.eventQueue = [...this.config.events];
    this.app = this.setupRoutes();
  }

  /**
   * Setup Express routes that mimic Controller II API
   * @returns Express application with configured routes
   */
  private setupRoutes(): Express {
    const app = express();
    app.use(express.json());

    // Health check endpoint
    app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });

    // Pairing endpoint - POST /smarthome/clients
    app.post('/smarthome/clients', (req: Request, res: Response) => {
      const { name, id } = req.body as { name?: string; id?: string };

      if (this.config.requirePairingButton && !this.isPaired) {
        res.status(401).json({
          '@type': 'JsonRestExceptionResponseEntity',
          errorCode: 'PAIRING_REQUIRED',
          statusCode: 401,
          message: 'Please press the button on the controller to pair this client',
        });
        return;
      }

      this.isPaired = true;
      res.status(201).json({
        '@type': 'client',
        id: id ?? 'mock-client-id',
        name: name ?? 'mock-client',
        roles: ['ROLE_DEFAULT_CLIENT'],
        createdDate: new Date().toISOString(),
      });
    });

    // JSON-RPC endpoint - POST /remote/json-rpc
    app.post('/remote/json-rpc', (req: Request, res: Response) => {
      const { jsonrpc, method, params } = req.body as {
        jsonrpc?: string;
        method?: string;
        params?: string[];
      };

      if (jsonrpc !== '2.0') {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid Request' },
        });
        return;
      }

      // Subscribe method - returns subscription ID
      if (method === 'RE/subscribe') {
        const subscriptionId = `subscription-${String(Date.now())}`;
        this.subscriptions.set(subscriptionId, { createdAt: new Date() });
        res.json({
          jsonrpc: '2.0',
          result: subscriptionId,
        });
        return;
      }

      // Long polling method - returns events
      if (method === 'RE/longPoll') {
        const subscriptionId = params?.[0];
        if (!subscriptionId || !this.subscriptions.has(subscriptionId)) {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32602, message: 'Invalid subscription ID' },
          });
          return;
        }

        // Simulate delay if configured
        setTimeout(() => {
          // Return all queued events and clear queue
          const events = [...this.eventQueue];
          this.eventQueue = [];

          res.json({
            jsonrpc: '2.0',
            result: events,
          });
        }, this.config.longPollingDelay);
        return;
      }

      // Unsubscribe method
      if (method === 'RE/unsubscribe') {
        const subscriptionId = params?.[0];
        if (subscriptionId) {
          this.subscriptions.delete(subscriptionId);
        }
        res.json({
          jsonrpc: '2.0',
          result: null,
        });
        return;
      }

      // Unknown method
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32601, message: 'Method not found' },
      });
    });

    // Get devices endpoint - GET /smarthome/devices
    app.get('/smarthome/devices', (_req: Request, res: Response) => {
      res.json(this.config.devices);
    });

    // Get rooms endpoint - GET /smarthome/rooms
    app.get('/smarthome/rooms', (_req: Request, res: Response) => {
      res.json(this.config.rooms);
    });

    return app;
  }

  /**
   * Start the mock server
   * @returns Promise resolving to the server URL with ephemeral port (e.g., http://localhost:54323)
   */
  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, () => {
        const address = this.server?.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to get server address'));
          return;
        }
        // Returns URL with ephemeral port assigned by OS (e.g., http://localhost:54323)
        const url = `http://localhost:${String(address.port)}`;
        resolve(url);
      });

      // Register error handler (server is guaranteed to be defined after listen() call)
      this.server.on('error', reject);
    });
  }

  /**
   * Stop the mock server
   * @returns Promise that resolves when server is closed
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.server = null;
          resolve();
        }
      });
    });
  }

  /**
   * Add events to the event queue for long polling
   * @param events - Events to add
   */
  addEvents(events: SmartHomeEvent[]): void {
    this.eventQueue.push(...events);
  }

  /**
   * Simulate pressing the pairing button on the controller
   */
  pressPairingButton(): void {
    this.isPaired = true;
  }

  /**
   * Clear all events from the queue
   */
  clearEvents(): void {
    this.eventQueue = [];
  }

  /**
   * Get the current event queue length
   * @returns Number of events in the queue
   */
  getEventQueueLength(): number {
    return this.eventQueue.length;
  }

  /**
   * Get the number of active subscriptions
   * @returns Number of active subscriptions
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }
}
