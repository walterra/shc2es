import type {
  SmartHomeEvent,
  DeviceServiceDataEvent,
  DeviceEvent,
  RoomEvent,
  MessageEvent,
  ClientEvent,
} from './smart-home-events';
import * as fixtures from '../../tests/fixtures/smart-home-events.json';

describe('SmartHomeEvent types', () => {
  describe('DeviceServiceDataEvent', () => {
    it('should parse a humidity sensor event', () => {
      const event = fixtures.deviceServiceData as DeviceServiceDataEvent;

      expect(event['@type']).toBe('DeviceServiceData');
      expect(event.id).toBe('HumidityLevel');
      expect(event.deviceId).toBe('hdm:ZigBee:001e5e0902b94515');
      expect(event.path).toBe('/devices/hdm:ZigBee:001e5e0902b94515/services/HumidityLevel');
      expect(event.state).toEqual({
        '@type': 'humidityLevelState',
        humidity: 42.71,
      });
      expect(event.time).toBe('2025-12-15T09:39:40.003Z');
    });

    it('should parse a valve tappet event with faults', () => {
      const event = fixtures.deviceServiceDataWithFaults as DeviceServiceDataEvent;

      expect(event['@type']).toBe('DeviceServiceData');
      expect(event.id).toBe('ValveTappet');
      expect(event.faults).toBeDefined();
      expect(event.faults?.entries).toHaveLength(1);
      expect(event.faults?.entries[0]).toEqual({
        type: 'VALVE_NO_BODY_ERROR',
        category: 'ERROR',
      });
    });

    it('should have optional operations array', () => {
      const event = fixtures.deviceServiceData as DeviceServiceDataEvent;
      expect(event.operations).toBeUndefined();

      // TypeScript should allow operations to be defined
      const withOps: DeviceServiceDataEvent = {
        ...event,
        operations: ['start', 'stop'],
      };
      expect(withOps.operations).toEqual(['start', 'stop']);
    });
  });

  describe('DeviceEvent', () => {
    it('should parse a device event', () => {
      const event = fixtures.device as DeviceEvent;

      expect(event['@type']).toBe('device');
      expect(event.id).toBe('hdm:ZigBee:f0fd45fffe557345');
      expect(event.name).toBe('EG WZ Thermostat 3');
      expect(event.deviceModel).toBe('TRV_GEN2_DUAL');
      expect(event.manufacturer).toBe('BOSCH');
      expect(event.serial).toBe('F0FD45FFFE557345');
      expect(event.status).toBe('UNDEFINED');
      expect(event.rootDeviceId).toBe('64-da-a0-42-eb-0a');
      expect(event.profile).toBe('GENERIC');
      expect(event.supportedProfiles).toEqual([]);
      expect(event.deviceServiceIds).toContain('Thermostat');
      expect(event.childDeviceIds).toEqual([]);
      expect(event.installationTimestamp).toBe(1765390090707);
    });

    it('should have optional parentDeviceId and roomId', () => {
      const event = fixtures.device as DeviceEvent;

      expect(event.parentDeviceId).toBe('roomClimateControl_hz_1');
      expect(event.roomId).toBe('hz_1');
    });
  });

  describe('RoomEvent', () => {
    it('should parse a room event', () => {
      const event = fixtures.room as RoomEvent;

      expect(event['@type']).toBe('room');
      expect(event.id).toBe('hz_1');
      expect(event.name).toBe('EG Wohnzimmer');
      expect(event.iconId).toBe('icon_room_living_room');
      expect(event.extProperties).toEqual({ humidity: '39.8' });
      expect(event.time).toBe('2025-12-15T09:39:40.038Z');
    });
  });

  describe('MessageEvent', () => {
    it('should parse a message event', () => {
      const event = fixtures.message as MessageEvent;

      expect(event['@type']).toBe('message');
      expect(event.id).toBe('d88624d2-a2c4-49a9-9169-6591b395a141');
      expect(event.sourceId).toBe('hdm:ZigBee:f0fd45fffe51fa08');
      expect(event.sourceType).toBe('DEVICE');
      expect(event.sourceName).toBe('UG Fitness Thermostat');
      expect(event.messageCode).toEqual({
        name: 'VALVE_NO_BODY_ERROR',
        category: 'ERROR',
      });
      expect(event.flags).toEqual(['STATUS', 'STICKY']);
      expect(event.arguments).toEqual({ deviceModel: 'TRV_GEN2_DUAL' });
      expect(event.timestamp).toBe(1765791587147);
    });
  });

  describe('ClientEvent', () => {
    it('should parse a client event', () => {
      const event = fixtures.client as ClientEvent;

      expect(event['@type']).toBe('client');
      expect(event.id).toBe('64D3FCCA-7AD5-4786-BDE6-F533EB989C92');
      expect(event.name).toBe('iPhone Walter');
      expect(event.clientType).toBe('MOBILE');
      expect(event.primaryRole).toBe('ROLE_DEFAULT_CLIENT');
      expect(event.os).toBe('IOS');
      expect(event.appVersion).toBe('10.31.1');
    });
  });

  describe('Discriminated union type narrowing', () => {
    it('should narrow DeviceServiceData type', () => {
      const event: SmartHomeEvent = fixtures.deviceServiceData as SmartHomeEvent;

      if (event['@type'] === 'DeviceServiceData') {
        // TypeScript should know this is DeviceServiceDataEvent
        expect(event.deviceId).toBeDefined();
        expect(event.path).toBeDefined();
        expect(event.state).toBeDefined();
      } else {
        fail('Expected DeviceServiceData event');
      }
    });

    it('should narrow device type', () => {
      const event: SmartHomeEvent = fixtures.device as SmartHomeEvent;

      if (event['@type'] === 'device') {
        // TypeScript should know this is DeviceEvent
        expect(event.deviceModel).toBeDefined();
        expect(event.manufacturer).toBeDefined();
        expect(event.serial).toBeDefined();
      } else {
        fail('Expected device event');
      }
    });

    it('should narrow room type', () => {
      const event: SmartHomeEvent = fixtures.room as SmartHomeEvent;

      if (event['@type'] === 'room') {
        // TypeScript should know this is RoomEvent
        expect(event.iconId).toBeDefined();
        expect(event.extProperties).toBeDefined();
      } else {
        fail('Expected room event');
      }
    });

    it('should narrow message type', () => {
      const event: SmartHomeEvent = fixtures.message as SmartHomeEvent;

      if (event['@type'] === 'message') {
        // TypeScript should know this is MessageEvent
        expect(event.sourceId).toBeDefined();
        expect(event.messageCode).toBeDefined();
        expect(event.flags).toBeDefined();
      } else {
        fail('Expected message event');
      }
    });

    it('should handle all types exhaustively with switch', () => {
      const events: SmartHomeEvent[] = [
        fixtures.deviceServiceData as SmartHomeEvent,
        fixtures.device as SmartHomeEvent,
        fixtures.room as SmartHomeEvent,
        fixtures.message as SmartHomeEvent,
        fixtures.client as SmartHomeEvent,
      ];

      const results = events.map((event) => {
        switch (event['@type']) {
          case 'DeviceServiceData':
            return 'device-service';
          case 'device':
            return 'device';
          case 'room':
            return 'room';
          case 'message':
            return 'message';
          case 'client':
            return 'client';
          default: {
            // This ensures TypeScript checks exhaustiveness
            const _exhaustive: never = event;
            return _exhaustive;
          }
        }
      });

      expect(results).toEqual(['device-service', 'device', 'room', 'message', 'client']);
    });
  });

  describe('OpenTelemetry trace context', () => {
    it('should include trace context fields in all events', () => {
      const events: SmartHomeEvent[] = [
        fixtures.deviceServiceData as SmartHomeEvent,
        fixtures.device as SmartHomeEvent,
        fixtures.room as SmartHomeEvent,
        fixtures.message as SmartHomeEvent,
      ];

      events.forEach((event) => {
        expect(event.trace_id).toBeDefined();
        expect(event.span_id).toBeDefined();
        expect(event.trace_flags).toBe('01');
        expect(event.time).toBeDefined();
      });
    });
  });
});
