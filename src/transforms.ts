/**
 * Data transformation functions for smart home events.
 *
 * These functions are used during ingestion to transform and normalize
 * events from the Bosch Smart Home Controller II before indexing to Elasticsearch.
 */

import type { SmartHomeEvent, GenericEvent } from './types/smart-home-events';
import { createLogger } from './logger';

const log = createLogger('transforms');

/**
 * Normalized sensor reading extracted from a smart home event.
 *
 * Represents a numeric measurement from a device (e.g., temperature, humidity,
 * valve position) in a standardized format for storage and analysis in Elasticsearch.
 *
 * @example
 * ```typescript
 * // Humidity reading
 * const humidity: Metric = {
 *   name: "humidity",
 *   value: 42.71
 * };
 *
 * // Temperature reading
 * const temperature: Metric = {
 *   name: "temperature",
 *   value: 21.5
 * };
 *
 * // Valve position (percentage)
 * const valveTappet: Metric = {
 *   name: "position",
 *   value: 35
 * };
 * ```
 */
export interface Metric {
  /** Name of the metric (e.g., 'humidity', 'temperature', 'position') */
  name: string;
  /** Numeric value of the measurement */
  value: number;
}

/**
 * Extract a numeric metric from a smart home event.
 *
 * For DeviceServiceData events, extracts from the state object.
 * For room events, extracts from extProperties (parsing string values).
 * Returns null for device, message, client, light, and unknown events.
 *
 * @param doc - Smart home event to extract metric from
 * @returns Metric object with name and value, or null if no metric found
 *
 * @example
 * ```typescript
 * const event = {
 *   "@type": "DeviceServiceData",
 *   state: { humidity: 42.5 }
 * };
 * extractMetric(event); // { name: "humidity", value: 42.5 }
 * ```
 */
export function extractMetric(doc: SmartHomeEvent | GenericEvent): Metric | null {
  // Use type narrowing with discriminated union
  switch (doc['@type']) {
    case 'DeviceServiceData': {
      // Extract from state object
      if (doc.state) {
        for (const [key, val] of Object.entries(doc.state)) {
          if (key !== '@type' && typeof val === 'number') {
            return { name: key, value: val };
          }
        }
      }
      return null;
    }

    case 'room': {
      // Extract from extProperties (values are strings)
      if (doc.extProperties) {
        for (const [key, val] of Object.entries(doc.extProperties)) {
          const num = parseFloat(String(val));
          if (!isNaN(num)) {
            return { name: key, value: num };
          }
        }
      }
      return null;
    }

    case 'device':
    case 'message':
    case 'client':
    case 'light':
      // These event types don't contain metrics
      return null;

    default:
      // Unknown event type - log warning and return null
      log.warn(
        { eventType: doc['@type'] },
        `Unknown event type encountered in extractMetric: ${doc['@type']}`,
      );
      return null;
  }
}

/**
 * Generate a unique document ID for Elasticsearch indexing.
 *
 * Uses event type, entity ID, and timestamp to create a deterministic ID.
 * This allows for idempotent ingestion (re-ingesting same event won't duplicate).
 *
 * For unknown event types, attempts to extract an ID from common fields.
 *
 * @param doc - Smart home event to extract metric from
 * @returns Unique document ID string
 *
 * @example
 * ```typescript
 * generateDocId({
 *   "@type": "DeviceServiceData",
 *   deviceId: "hdm:ZigBee:001",
 *   id: "HumidityLevel",
 *   time: "2025-12-15T10:00:00Z"
 * });
 * // Returns: "DeviceServiceData-hdm:ZigBee:001-HumidityLevel-2025-12-15T10:00:00Z"
 * ```
 */
export function generateDocId(doc: SmartHomeEvent | GenericEvent): string {
  // Generate unique document ID based on event type
  const timestamp = doc.time;

  // Helper to ensure value is a string (not an object)
  const toString = (val: unknown): string => {
    if (val === null || val === undefined) {
      return 'unknown';
    }
    if (typeof val === 'string') {
      return val;
    }
    // If it's an object, use JSON.stringify (shouldn't happen with proper types)
    return JSON.stringify(val);
  };

  switch (doc['@type']) {
    case 'DeviceServiceData':
      // Format: DeviceServiceData-<deviceId>-<serviceId>-<timestamp>
      return [doc['@type'], toString(doc.deviceId), toString(doc.id), toString(timestamp)].join(
        '-',
      );

    case 'device':
      // Format: device-<id>-<timestamp>
      return [doc['@type'], toString(doc.id), toString(timestamp)].join('-');

    case 'room':
      // Format: room-<id>-<timestamp>
      return [doc['@type'], toString(doc.id), toString(timestamp)].join('-');

    case 'message':
      // Format: message-<id>-<timestamp>
      return [doc['@type'], toString(doc.id), toString(timestamp)].join('-');

    case 'client':
      // Format: client-<id>-<timestamp>
      return [doc['@type'], toString(doc.id), toString(timestamp)].join('-');

    case 'light':
      // Format: light-<id>-<timestamp>
      return [doc['@type'], toString(doc.id), toString(timestamp)].join('-');

    default:
      // Unknown event type - try to extract ID from common fields
      log.warn(
        { eventType: doc['@type'] },
        `Unknown event type encountered in generateDocId: ${doc['@type']}`,
      );
      // Try common ID fields: id, deviceId, or fall back to timestamp only
      const entityId =
        'id' in doc && doc.id
          ? toString(doc.id)
          : 'deviceId' in doc && doc.deviceId
            ? toString(doc.deviceId)
            : 'unknown';
      return [doc['@type'], entityId, toString(timestamp)].join('-');
  }
}
