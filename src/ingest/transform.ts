/**
 * Event transformation for Elasticsearch indexing.
 *
 * Transforms raw smart home events into enriched documents with device/room metadata.
 * Handles both known and unknown event types gracefully.
 */

import { createLogger } from '../logger';
import type { SmartHomeEvent, GenericEvent } from '../types/smart-home-events';
import { isKnownEventType } from '../types/smart-home-events';
import type { Metric } from '../transforms';
import { extractMetric } from '../transforms';
import { getDeviceInfo, getRoomInfo } from './registry';

const log = createLogger('ingest:transform');

/**
 * Device field in transformed event.
 */
export interface DeviceField {
  name: string;
  type?: string;
}

/**
 * Room field in transformed event.
 */
export interface RoomField {
  id: string;
  name: string;
}

/**
 * Transformed event ready for Elasticsearch indexing.
 */
export interface TransformedEvent {
  '@timestamp': string | undefined;
  '@type'?: string;
  id?: string;
  deviceId?: string;
  path?: string;
  device?: DeviceField;
  room?: RoomField;
  metric?: Metric;
}

/**
 * Enriches event with device metadata from registry.
 *
 * @param deviceId - Device identifier
 * @returns Device and room fields or undefined
 */
function enrichWithDeviceInfo(
  deviceId: string,
): { device?: DeviceField; room?: RoomField } | undefined {
  const deviceInfo = getDeviceInfo(deviceId);
  if (!deviceInfo) return undefined;

  const device: DeviceField = { name: deviceInfo.name };
  if (deviceInfo.type) {
    device.type = deviceInfo.type;
  }

  // Add room if device has roomId
  if (!deviceInfo.roomId) {
    return { device };
  }

  const roomInfo = getRoomInfo(deviceInfo.roomId);
  if (!roomInfo) {
    return { device };
  }

  return {
    device,
    room: {
      id: deviceInfo.roomId,
      name: roomInfo.name,
    },
  };
}

/**
 * Enriches event with room metadata from registry.
 *
 * @param roomId - Room identifier
 * @returns Room field or undefined
 */
function enrichWithRoomInfo(roomId: string): RoomField | undefined {
  const roomInfo = getRoomInfo(roomId);
  if (!roomInfo) return undefined;

  return {
    id: roomId,
    name: roomInfo.name,
  };
}

/**
 * Transforms unknown event types with basic field extraction.
 *
 * @param doc - Generic event document
 * @returns Partial transformed event
 */
function transformUnknownEvent(doc: GenericEvent): TransformedEvent {
  log.warn(
    { eventType: doc['@type'], eventId: doc.id },
    `Unknown event type encountered: ${doc['@type']}. Indexing with basic field extraction only.`,
  );

  const result: TransformedEvent = {
    '@timestamp': doc.time,
    '@type': doc['@type'],
    id: typeof doc.id === 'string' ? doc.id : undefined,
  };

  // Try to extract deviceId for unknown types (common field)
  if ('deviceId' in doc && typeof doc.deviceId === 'string') {
    result.deviceId = doc.deviceId;
  }

  // Try to extract metric from unknown types
  const metric = extractMetric(doc);
  if (metric) {
    result.metric = metric;
  }

  return result;
}

/**
 * Transforms raw event into Elasticsearch document.
 *
 * Enriches events with device/room metadata from registry.
 * Handles both known and unknown event types gracefully.
 * Fast in-memory transformation without OpenTelemetry spans.
 *
 * @param doc - Raw event from NDJSON file
 * @returns Transformed event ready for indexing
 */
export function transformEvent(doc: GenericEvent): TransformedEvent {
  // Check if this is a known event type
  if (!isKnownEventType(doc)) {
    return transformUnknownEvent(doc);
  }

  // Base fields for all events
  const result: TransformedEvent = {
    '@timestamp': doc.time,
    '@type': doc['@type'],
    id: typeof doc.id === 'string' ? doc.id : undefined,
  };

  const knownDoc = doc as unknown as SmartHomeEvent;

  // Type-specific enrichment
  switch (knownDoc['@type']) {
    case 'DeviceServiceData': {
      result.deviceId = knownDoc.deviceId;
      result.path = knownDoc.path;

      const enrichment = enrichWithDeviceInfo(knownDoc.deviceId);
      if (enrichment) {
        result.device = enrichment.device;
        result.room = enrichment.room;
      }
      break;
    }

    case 'room': {
      const room = enrichWithRoomInfo(knownDoc.id);
      if (room) {
        result.room = room;
      }
      break;
    }

    case 'device':
    case 'message':
    case 'client':
    case 'light':
      // These event types don't need special field handling
      break;
  }

  // Extract metric (works for all types)
  const metric = extractMetric(knownDoc);
  if (metric) {
    result.metric = metric;
  }

  return result;
}
