/**
 * Unit tests for poll module
 * Tests pure functions and business logic with mocked dependencies
 */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// Disabled for Jest mocks - jest.fn() mocks don't have TypeScript types

// Mock logger before importing poll to prevent file writes
jest.mock('./logger', () => {
  return {
    appLogger: {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      fatal: jest.fn(),
    },
    dataLogger: {
      info: jest.fn(),
    },
    BshbLogger: jest.fn().mockImplementation(() => ({
      fine: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  };
});

// Mock config to prevent actual config loading
jest.mock('./config', () => {
  return {
    CERTS_DIR: '/mock/certs',
    CERT_FILE: '/mock/certs/client-cert.pem',
    KEY_FILE: '/mock/certs/client-key.pem',
    getConfigPaths: jest.fn(() => ({
      configDir: '/mock/.shc2es',
      certsDir: '/mock/certs',
      dataDir: '/mock/data',
      logsDir: '/mock/logs',
    })),
  };
});

// Mock validation to prevent actual config validation
jest.mock('./validation', () => {
  return {
    validatePollConfig: jest.fn(
      (): {
        isErr: () => boolean;
        value: {
          bshHost: string;
          bshPassword: string;
          bshClientName: string;
          bshClientId: string;
        };
      } => ({
        isErr: () => false,
        value: {
          bshHost: '192.168.1.100',
          bshPassword: 'test-password',
          bshClientName: 'test-client',
          bshClientId: 'test-id',
        },
      }),
    ),
  };
});

// Mock bosch-smart-home-bridge using our existing mock
jest.mock('bosch-smart-home-bridge', () => {
  // Note: Dynamic import in jest.mock() factory
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return
  return require('../tests/mocks/bosch-smart-home-bridge.mock').mockBoschSmartHomeBridge;
});

// Import poll functions and loggers after mocks are set up
import * as fc from 'fast-check';
import {
  isTransientError,
  isPairingButtonError,
  createBridge,
  processEvent,
  processEvents,
} from './poll';
import { dataLogger, appLogger } from './logger';

// Disable OpenTelemetry
process.env.OTEL_SDK_DISABLED = 'true';

describe('poll module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createBridge', () => {
    it('should create a bridge with host, cert, and key', () => {
      const host = '192.168.1.100';
      const cert = 'mock-cert';
      const key = 'mock-key';

      const bridge = createBridge(host, cert, key);

      expect(bridge).toBeDefined();
      expect(bridge.getBshcClient).toBeDefined();
      expect(bridge.pairIfNeeded).toBeDefined();
    });

    it('should return bridge with getBshcClient method', () => {
      const bridge = createBridge('192.168.1.1', 'cert', 'key');
      const client = bridge.getBshcClient();

      expect(client).toBeDefined();
      expect(client.subscribe).toBeDefined();
    });
  });

  describe('processEvent', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should log DeviceServiceData event to dataLogger', () => {
      const event = {
        '@type': 'DeviceServiceData',
        id: 'HumidityLevel',
        deviceId: 'hdm:ZigBee:001e5e0902b94515',
        state: { humidity: 42.71 },
      };

      processEvent(event);

      expect(dataLogger.info).toHaveBeenCalledWith(event);
    });

    it('should log device event to dataLogger', () => {
      const event = {
        '@type': 'device',
        id: 'hdm:ZigBee:f0fd45fffe557345',
        deviceId: 'hdm:ZigBee:f0fd45fffe557345',
        name: 'Test Thermostat',
      };

      processEvent(event);

      expect(dataLogger.info).toHaveBeenCalledWith(event);
    });

    it('should log room event to dataLogger', () => {
      const event = {
        '@type': 'room',
        id: 'hz_1',
        name: 'Living Room',
      };

      processEvent(event);

      expect(dataLogger.info).toHaveBeenCalledWith(event);
    });

    it('should log debug info to appLogger', () => {
      const event = {
        '@type': 'DeviceServiceData',
        id: 'test',
        deviceId: 'device-123',
      };

      processEvent(event);

      expect(appLogger.debug).toHaveBeenCalledWith(
        {
          'event.type': 'DeviceServiceData',
          'device.id': 'device-123',
        },
        'Received DeviceServiceData event from device device-123',
      );
    });

    it('should handle events without deviceId', () => {
      const event = {
        '@type': 'message',
        id: 'msg-123',
      };

      processEvent(event);

      expect(dataLogger.info).toHaveBeenCalledWith(event);
      expect(appLogger.debug).toHaveBeenCalledWith(
        {
          'event.type': 'message',
          'device.id': undefined,
        },
        'Received message event from device undefined',
      );
    });
  });

  describe('processEvents', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should process multiple events', () => {
      const events = [
        { '@type': 'DeviceServiceData', id: '1', deviceId: 'device1' },
        { '@type': 'device', id: '2', deviceId: 'device2' },
        { '@type': 'room', id: '3' },
      ];

      processEvents(events);

      expect(dataLogger.info).toHaveBeenCalledTimes(3);
      expect(dataLogger.info).toHaveBeenNthCalledWith(1, events[0]);
      expect(dataLogger.info).toHaveBeenNthCalledWith(2, events[1]);
      expect(dataLogger.info).toHaveBeenNthCalledWith(3, events[2]);
    });

    it('should log summary after processing', () => {
      const events = [
        { '@type': 'Event1', id: '1' },
        { '@type': 'Event2', id: '2' },
      ];

      processEvents(events);

      expect(appLogger.info).toHaveBeenCalledWith(
        { 'event.count': 2 },
        'Processed 2 events from controller',
      );
    });

    it('should handle empty event array', () => {
      processEvents([]);

      expect(dataLogger.info).not.toHaveBeenCalled();
      expect(appLogger.info).not.toHaveBeenCalled();
    });

    it('should process single event', () => {
      const events = [{ '@type': 'DeviceServiceData', id: 'test' }];

      processEvents(events);

      expect(dataLogger.info).toHaveBeenCalledTimes(1);
      expect(appLogger.info).toHaveBeenCalledWith(
        { 'event.count': 1 },
        'Processed 1 events from controller',
      );
    });

    it('should process events in order', () => {
      const events = [
        { '@type': 'Event1', id: '1' },
        { '@type': 'Event2', id: '2' },
        { '@type': 'Event3', id: '3' },
      ];

      processEvents(events);

      // Verify order by checking call sequence
      const calls = dataLogger.info.mock.calls;
      expect(calls[0][0]).toBe(events[0]);
      expect(calls[1][0]).toBe(events[1]);
      expect(calls[2][0]).toBe(events[2]);
    });
  });

  describe('Property-based tests', () => {
    describe('isTransientError properties', () => {
      it('should identify all known transient error codes', () => {
        const transientCodes = ['TIMEOUT', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH'];

        fc.assert(
          fc.property(fc.constantFrom(...transientCodes), (code: string) => {
            expect(isTransientError(code)).toBe(true);
          }),
        );
      });

      it('should identify transient errors in any message context', () => {
        const transientCodes = ['TIMEOUT', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH'];

        fc.assert(
          fc.property(
            fc.constantFrom(...transientCodes),
            fc.string(),
            fc.string(),
            (code: string, prefix: string, suffix: string) => {
              const message = prefix + code + suffix;
              expect(isTransientError(message)).toBe(true);
            },
          ),
        );
      });

      it('should not identify authentication/authorization errors as transient', () => {
        const authErrors = ['Authentication', 'Unauthorized', 'Invalid credentials', 'FORBIDDEN'];

        fc.assert(
          fc.property(fc.constantFrom(...authErrors), (error: string) => {
            expect(isTransientError(error)).toBe(false);
          }),
        );
      });

      it('should reject arbitrary unknown error messages', () => {
        const knownTransient = ['TIMEOUT', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH'];
        const unknownErrors = fc
          .string()
          .filter((s) => !knownTransient.some((code) => s.includes(code)));

        fc.assert(
          fc.property(unknownErrors, (error: string) => {
            // Unknown errors should not be transient
            if (!error.includes('Authentication') && !error.includes('Unauthorized')) {
              expect(isTransientError(error)).toBe(false);
            }
          }),
        );
      });

      it('should be case-sensitive for error codes', () => {
        const transientCodes = ['TIMEOUT', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH'];

        fc.assert(
          fc.property(fc.constantFrom(...transientCodes), (code: string) => {
            const lowercase = code.toLowerCase();
            // Original uppercase should be transient
            expect(isTransientError(code)).toBe(true);
            // Lowercase should not be transient (case-sensitive)
            expect(isTransientError(lowercase)).toBe(false);
          }),
        );
      });
    });

    describe('isPairingButtonError properties', () => {
      it('should identify messages containing "press the button"', () => {
        fc.assert(
          fc.property(fc.string(), fc.string(), (prefix: string, suffix: string) => {
            const message = prefix + 'press the button' + suffix;
            expect(isPairingButtonError(message)).toBe(true);
          }),
        );
      });

      it('should reject messages without the exact phrase', () => {
        const nonPairingMessages = fc.string().filter((s) => !s.includes('press the button'));

        fc.assert(
          fc.property(nonPairingMessages, (message: string) => {
            expect(isPairingButtonError(message)).toBe(false);
          }),
        );
      });

      it('should be case-sensitive', () => {
        fc.assert(
          fc.property(fc.string(), fc.string(), (prefix: string, suffix: string) => {
            // Correct case should match
            expect(isPairingButtonError(prefix + 'press the button' + suffix)).toBe(true);
            // Wrong case should not match
            expect(isPairingButtonError(prefix + 'PRESS THE BUTTON' + suffix)).toBe(false);
            expect(isPairingButtonError(prefix + 'Press The Button' + suffix)).toBe(false);
          }),
        );
      });
    });
  });
});
