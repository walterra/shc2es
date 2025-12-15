/**
 * Unit tests for poll module
 * Tests pure functions and business logic with mocked dependencies
 */

// Mock logger before importing poll to prevent file writes
jest.mock('../../src/logger', () => {
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
jest.mock('../../src/config', () => {
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

// Mock bosch-smart-home-bridge using our existing mock
jest.mock('bosch-smart-home-bridge', () => {
  return require('../mocks/bosch-smart-home-bridge.mock').mockBoschSmartHomeBridge;
});

// Disable OpenTelemetry
process.env.OTEL_SDK_DISABLED = 'true';

describe('poll module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isTransientError', () => {
    const { isTransientError } = require('../../src/poll');

    it('should identify TIMEOUT as transient', () => {
      expect(isTransientError('Request TIMEOUT')).toBe(true);
      expect(isTransientError('TIMEOUT occurred')).toBe(true);
    });

    it('should identify ECONNRESET as transient', () => {
      expect(isTransientError('Error: ECONNRESET')).toBe(true);
    });

    it('should identify ENOTFOUND as transient', () => {
      expect(isTransientError('getaddrinfo ENOTFOUND')).toBe(true);
    });

    it('should identify EHOSTUNREACH as transient', () => {
      expect(isTransientError('connect EHOSTUNREACH')).toBe(true);
    });

    it('should not identify authentication errors as transient', () => {
      expect(isTransientError('Authentication failed')).toBe(false);
    });

    it('should not identify authorization errors as transient', () => {
      expect(isTransientError('Unauthorized')).toBe(false);
    });

    it('should not identify invalid credentials as transient', () => {
      expect(isTransientError('Invalid credentials')).toBe(false);
    });

    it('should not identify generic errors as transient', () => {
      expect(isTransientError('Something went wrong')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isTransientError('timeout')).toBe(false); // lowercase
      expect(isTransientError('TIMEOUT')).toBe(true);  // uppercase
    });
  });

  describe('isPairingButtonError', () => {
    const { isPairingButtonError } = require('../../src/poll');

    it('should identify pairing button messages', () => {
      expect(isPairingButtonError('press the button on Controller II')).toBe(true);
    });

    it('should identify partial pairing button messages', () => {
      expect(isPairingButtonError('Please press the button to continue')).toBe(true);
    });

    it('should not identify unrelated errors', () => {
      expect(isPairingButtonError('Connection failed')).toBe(false);
    });

    it('should not identify timeout errors', () => {
      expect(isPairingButtonError('TIMEOUT')).toBe(false);
    });

    it('should not identify network errors', () => {
      expect(isPairingButtonError('ECONNRESET')).toBe(false);
    });
  });

  describe('createBridge', () => {
    it('should create a bridge with host, cert, and key', () => {
      const { createBridge } = require('../../src/poll');
      
      const host = '192.168.1.100';
      const cert = 'mock-cert';
      const key = 'mock-key';

      const bridge = createBridge(host, cert, key);

      expect(bridge).toBeDefined();
      expect(bridge.getBshcClient).toBeDefined();
      expect(bridge.pairIfNeeded).toBeDefined();
    });

    it('should return bridge with getBshcClient method', () => {
      const { createBridge } = require('../../src/poll');
      
      const bridge = createBridge('192.168.1.1', 'cert', 'key');
      const client = bridge.getBshcClient();

      expect(client).toBeDefined();
      expect(client.subscribe).toBeDefined();
    });
  });

  describe('processEvent', () => {
    const { processEvent } = require('../../src/poll');
    const { dataLogger, appLogger } = require('../../src/logger');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should log DeviceServiceData event to dataLogger', () => {
      const event = {
        '@type': 'DeviceServiceData',
        id: 'HumidityLevel',
        deviceId: 'hdm:ZigBee:001e5e0902b94515',
        state: { humidity: 42.71 }
      };

      processEvent(event);

      expect(dataLogger.info).toHaveBeenCalledWith(event);
    });

    it('should log device event to dataLogger', () => {
      const event = {
        '@type': 'device',
        id: 'hdm:ZigBee:f0fd45fffe557345',
        deviceId: 'hdm:ZigBee:f0fd45fffe557345',
        name: 'Test Thermostat'
      };

      processEvent(event);

      expect(dataLogger.info).toHaveBeenCalledWith(event);
    });

    it('should log room event to dataLogger', () => {
      const event = {
        '@type': 'room',
        id: 'hz_1',
        name: 'Living Room'
      };

      processEvent(event);

      expect(dataLogger.info).toHaveBeenCalledWith(event);
    });

    it('should log debug info to appLogger', () => {
      const event = {
        '@type': 'DeviceServiceData',
        id: 'test',
        deviceId: 'device-123'
      };

      processEvent(event);

      expect(appLogger.debug).toHaveBeenCalledWith(
        {
          eventType: 'DeviceServiceData',
          deviceId: 'device-123'
        },
        'Event received'
      );
    });

    it('should handle events without deviceId', () => {
      const event = {
        '@type': 'message',
        id: 'msg-123'
      };

      processEvent(event);

      expect(dataLogger.info).toHaveBeenCalledWith(event);
      expect(appLogger.debug).toHaveBeenCalledWith(
        {
          eventType: 'message',
          deviceId: undefined
        },
        'Event received'
      );
    });
  });

  describe('processEvents', () => {
    const { processEvents } = require('../../src/poll');
    const { dataLogger, appLogger } = require('../../src/logger');

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
        { count: 2 },
        'Events processed'
      );
    });

    it('should handle empty event array', () => {
      processEvents([]);

      expect(dataLogger.info).not.toHaveBeenCalled();
      expect(appLogger.info).not.toHaveBeenCalled();
    });

    it('should process single event', () => {
      const events = [
        { '@type': 'DeviceServiceData', id: 'test' }
      ];

      processEvents(events);

      expect(dataLogger.info).toHaveBeenCalledTimes(1);
      expect(appLogger.info).toHaveBeenCalledWith(
        { count: 1 },
        'Events processed'
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
});
