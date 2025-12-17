/**
 * Tests for transformation functions with typed smart home events.
 *
 * These tests verify the actual transformation logic used during data ingestion.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { SmartHomeEvent } from './types/smart-home-events';
import { extractMetric, generateDocId } from './transforms';
import * as fixtures from '../tests/fixtures/smart-home-events.json';

describe('Ingest transformation functions', () => {
  describe('extractMetric', () => {
    it('should extract humidity metric from DeviceServiceData', () => {
      const event = fixtures.deviceServiceData as SmartHomeEvent;
      const metric = extractMetric(event);

      expect(metric).toEqual({ name: 'humidity', value: 42.71 });
    });

    it('should extract position metric from ValveTappet state', () => {
      const event = fixtures.deviceServiceDataWithFaults as SmartHomeEvent;
      const metric = extractMetric(event);

      expect(metric).toEqual({ name: 'position', value: 0 });
    });

    it('should extract metric from room extProperties', () => {
      const event = fixtures.room as SmartHomeEvent;
      const metric = extractMetric(event);

      expect(metric).toEqual({ name: 'humidity', value: 39.8 });
    });

    it('should return null for device events', () => {
      const event = fixtures.device as SmartHomeEvent;
      const metric = extractMetric(event);

      expect(metric).toBeNull();
    });

    it('should return null for message events', () => {
      const event = fixtures.message as SmartHomeEvent;
      const metric = extractMetric(event);

      expect(metric).toBeNull();
    });

    it('should return null for client events', () => {
      const event = fixtures.client as SmartHomeEvent;
      const metric = extractMetric(event);

      expect(metric).toBeNull();
    });

    it('should return null when no numeric values in state', () => {
      const event: SmartHomeEvent = {
        '@type': 'DeviceServiceData',
        time: '2025-12-15T10:00:00Z',
        id: 'Test',
        deviceId: 'test-device',
        path: '/test',
        state: {
          '@type': 'testState',
          status: 'OK',
          message: 'All good',
        },
      };

      const metric = extractMetric(event);
      expect(metric).toBeNull();
    });

    it('should return null for room without extProperties', () => {
      const event: SmartHomeEvent = {
        '@type': 'room',
        time: '2025-12-10T15:37:02.286Z',
        id: 'hz_2',
        name: 'EG Home Office',
        iconId: 'icon_room_office',
        // extProperties is optional and undefined here
      };

      const metric = extractMetric(event);
      expect(metric).toBeNull();
    });
  });

  describe('generateDocId', () => {
    it('should generate ID for DeviceServiceData event', () => {
      const event = fixtures.deviceServiceData as SmartHomeEvent;
      const id = generateDocId(event);

      expect(id).toBe(
        'DeviceServiceData-hdm:ZigBee:001e5e0902b94515-HumidityLevel-2025-12-15T09:39:40.003Z',
      );
    });

    it('should generate ID for device event', () => {
      const event = fixtures.device as SmartHomeEvent;
      const id = generateDocId(event);

      expect(id).toBe('device-hdm:ZigBee:f0fd45fffe557345-2025-12-15T09:41:15.523Z');
    });

    it('should generate ID for room event', () => {
      const event = fixtures.room as SmartHomeEvent;
      const id = generateDocId(event);

      expect(id).toBe('room-hz_1-2025-12-15T09:39:40.038Z');
    });

    it('should generate ID for message event', () => {
      const event = fixtures.message as SmartHomeEvent;
      const id = generateDocId(event);

      expect(id).toBe('message-d88624d2-a2c4-49a9-9169-6591b395a141-2025-12-15T09:39:47.139Z');
    });

    it('should generate ID for client event', () => {
      const event = fixtures.client as SmartHomeEvent;
      const id = generateDocId(event);

      expect(id).toBe('client-64D3FCCA-7AD5-4786-BDE6-F533EB989C92-2025-12-12T15:28:40.929Z');
    });

    it('should generate unique IDs for different events', () => {
      const events: SmartHomeEvent[] = [
        fixtures.deviceServiceData as SmartHomeEvent,
        fixtures.device as SmartHomeEvent,
        fixtures.room as SmartHomeEvent,
        fixtures.message as SmartHomeEvent,
        fixtures.client as SmartHomeEvent,
      ];

      const ids = events.map(generateDocId);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Property-based tests', () => {
    // Arbitrary generators for smart home events
    // Generate timestamps as ISO strings directly to avoid Invalid Date errors
    const arbitraryTimestamp = fc
      .integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') })
      .map((timestamp: number) => new Date(timestamp).toISOString());

    const arbitraryDeviceServiceDataEvent = fc.record({
      '@type': fc.constant('DeviceServiceData' as const),
      time: arbitraryTimestamp,
      id: fc.string({ minLength: 1 }),
      deviceId: fc.string({ minLength: 1 }),
      path: fc.string({ minLength: 1 }),
      state: fc.oneof(
        // Numeric states (should extract metrics)
        fc.record({ '@type': fc.string(), humidity: fc.double() }),
        fc.record({ '@type': fc.string(), temperature: fc.double() }),
        fc.record({ '@type': fc.string(), position: fc.integer() }),
        // Non-numeric state (should return null)
        fc.record({ '@type': fc.string(), status: fc.string() }),
      ),
    });

    const arbitraryDeviceEvent = fc.record({
      '@type': fc.constant('device' as const),
      time: arbitraryTimestamp,
      id: fc.string({ minLength: 1 }),
      name: fc.string(),
      deviceModel: fc.string(),
    });

    const arbitraryRoomEvent = fc.record({
      '@type': fc.constant('room' as const),
      time: arbitraryTimestamp,
      id: fc.string({ minLength: 1 }),
      name: fc.string(),
      iconId: fc.string(),
      extProperties: fc.option(
        fc.record({
          humidity: fc.double().map((n) => n.toString()),
          temperature: fc.double().map((n) => n.toString()),
        }),
        { nil: undefined },
      ),
    });

    const arbitraryMessageEvent = fc.record({
      '@type': fc.constant('message' as const),
      time: arbitraryTimestamp,
      id: fc.string({ minLength: 1 }),
    });

    const arbitraryClientEvent = fc.record({
      '@type': fc.constant('client' as const),
      time: arbitraryTimestamp,
      id: fc.string({ minLength: 1 }),
      name: fc.string(),
    });

    const arbitrarySmartHomeEvent = fc.oneof(
      arbitraryDeviceServiceDataEvent,
      arbitraryDeviceEvent,
      arbitraryRoomEvent,
      arbitraryMessageEvent,
      arbitraryClientEvent,
    );

    describe('extractMetric properties', () => {
      it('should never throw, always return Metric or null', () => {
        fc.assert(
          fc.property(arbitrarySmartHomeEvent, (event) => {
            const result = extractMetric(event);

            // Should not throw and should return Metric or null
            if (result) {
              expect(result).toHaveProperty('name');
              expect(result).toHaveProperty('value');
              expect(typeof result.name).toBe('string');
              expect(typeof result.value).toBe('number');
            } else {
              expect(result).toBeNull();
            }
          }),
        );
      });

      it('should return null for events without numeric data', () => {
        const nonMetricEvents = fc.oneof(
          arbitraryDeviceEvent,
          arbitraryMessageEvent,
          arbitraryClientEvent,
        );

        fc.assert(
          fc.property(nonMetricEvents, (event) => {
            const result = extractMetric(event);
            expect(result).toBeNull();
          }),
        );
      });
    });

    describe('generateDocId properties', () => {
      it('should be deterministic (same event produces same ID)', () => {
        fc.assert(
          fc.property(arbitrarySmartHomeEvent, (event) => {
            const id1 = generateDocId(event);
            const id2 = generateDocId(event);

            expect(id1).toBe(id2);
          }),
        );
      });

      it('should never return empty string', () => {
        fc.assert(
          fc.property(arbitrarySmartHomeEvent, (event) => {
            const id = generateDocId(event);

            expect(id).toBeTruthy();
            expect(id.length).toBeGreaterThan(0);
          }),
        );
      });

      it('should include event type in the ID', () => {
        fc.assert(
          fc.property(arbitrarySmartHomeEvent, (event) => {
            const id = generateDocId(event);

            // ID should start with the event type
            expect(id.startsWith(event['@type'])).toBe(true);
          }),
        );
      });

      it('should include timestamp in the ID', () => {
        fc.assert(
          fc.property(arbitrarySmartHomeEvent, (event) => {
            const id = generateDocId(event);

            // ID should contain the timestamp
            expect(id).toContain(event.time);
          }),
        );
      });

      it('should generate different IDs for events with different timestamps', () => {
        fc.assert(
          fc.property(
            arbitraryDeviceServiceDataEvent,
            arbitraryTimestamp,
            arbitraryTimestamp,
            (baseEvent, time1, time2) => {
              // Skip if timestamps are the same
              if (time1 === time2) {
                return true;
              }

              const event1 = { ...baseEvent, time: time1 };
              const event2 = { ...baseEvent, time: time2 };

              const id1 = generateDocId(event1);
              const id2 = generateDocId(event2);

              expect(id1).not.toBe(id2);
            },
          ),
        );
      });
    });
  });
});
