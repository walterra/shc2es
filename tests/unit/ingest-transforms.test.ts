/**
 * Tests for transformation functions with typed smart home events.
 * 
 * These tests verify the actual transformation logic used during data ingestion.
 */
import { SmartHomeEvent } from "../../src/types/smart-home-events";
import { extractMetric, generateDocId } from "../../src/transforms";
import * as fixtures from "../fixtures/smart-home-events.json";

describe("Ingest transformation functions", () => {
  describe("extractMetric", () => {

    it("should extract humidity metric from DeviceServiceData", () => {
      const event = fixtures.deviceServiceData as SmartHomeEvent;
      const metric = extractMetric(event);

      expect(metric).toEqual({ name: "humidity", value: 42.71 });
    });

    it("should extract position metric from ValveTappet state", () => {
      const event = fixtures.deviceServiceDataWithFaults as SmartHomeEvent;
      const metric = extractMetric(event);

      expect(metric).toEqual({ name: "position", value: 0 });
    });

    it("should extract metric from room extProperties", () => {
      const event = fixtures.room as SmartHomeEvent;
      const metric = extractMetric(event);

      expect(metric).toEqual({ name: "humidity", value: 39.8 });
    });

    it("should return null for device events", () => {
      const event = fixtures.device as SmartHomeEvent;
      const metric = extractMetric(event);

      expect(metric).toBeNull();
    });

    it("should return null for message events", () => {
      const event = fixtures.message as SmartHomeEvent;
      const metric = extractMetric(event);

      expect(metric).toBeNull();
    });

    it("should return null for client events", () => {
      const event = fixtures.client as SmartHomeEvent;
      const metric = extractMetric(event);

      expect(metric).toBeNull();
    });

    it("should return null when no numeric values in state", () => {
      const event: SmartHomeEvent = {
        "@type": "DeviceServiceData",
        time: "2025-12-15T10:00:00Z",
        id: "Test",
        deviceId: "test-device",
        path: "/test",
        state: {
          "@type": "testState",
          status: "OK",
          message: "All good",
        },
      };

      const metric = extractMetric(event);
      expect(metric).toBeNull();
    });

    it("should return null for room without extProperties", () => {
      const event: SmartHomeEvent = {
        "@type": "room",
        time: "2025-12-10T15:37:02.286Z",
        id: "hz_2",
        name: "EG Home Office",
        iconId: "icon_room_office",
        // extProperties is optional and undefined here
      };

      const metric = extractMetric(event);
      expect(metric).toBeNull();
    });
  });

  describe("generateDocId", () => {

    it("should generate ID for DeviceServiceData event", () => {
      const event = fixtures.deviceServiceData as SmartHomeEvent;
      const id = generateDocId(event);

      expect(id).toBe(
        "DeviceServiceData-hdm:ZigBee:001e5e0902b94515-HumidityLevel-2025-12-15T09:39:40.003Z",
      );
    });

    it("should generate ID for device event", () => {
      const event = fixtures.device as SmartHomeEvent;
      const id = generateDocId(event);

      expect(id).toBe(
        "device-hdm:ZigBee:f0fd45fffe557345-2025-12-15T09:41:15.523Z",
      );
    });

    it("should generate ID for room event", () => {
      const event = fixtures.room as SmartHomeEvent;
      const id = generateDocId(event);

      expect(id).toBe("room-hz_1-2025-12-15T09:39:40.038Z");
    });

    it("should generate ID for message event", () => {
      const event = fixtures.message as SmartHomeEvent;
      const id = generateDocId(event);

      expect(id).toBe(
        "message-d88624d2-a2c4-49a9-9169-6591b395a141-2025-12-15T09:39:47.139Z",
      );
    });

    it("should generate ID for client event", () => {
      const event = fixtures.client as SmartHomeEvent;
      const id = generateDocId(event);

      expect(id).toBe(
        "client-64D3FCCA-7AD5-4786-BDE6-F533EB989C92-2025-12-12T15:28:40.929Z",
      );
    });

    it("should generate unique IDs for different events", () => {
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


});
