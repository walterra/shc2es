/**
 * Type definitions for Bosch Smart Home Controller II events.
 *
 * These types are based on actual event data from the controller's long polling API.
 * The library `bosch-smart-home-bridge` returns `any` types, so we define precise
 * types here for type safety.
 *
 * @see https://github.com/BoschSmartHome/bosch-shc-api-docs
 */

/**
 * Common fields present in all smart home events.
 * These include OpenTelemetry trace context added by instrumentation.
 */
interface BaseEvent {
  /** ISO 8601 timestamp when the event occurred */
  time: string;
  /** OpenTelemetry trace ID (added by instrumentation) */
  trace_id?: string;
  /** OpenTelemetry span ID (added by instrumentation) */
  span_id?: string;
  /** OpenTelemetry trace flags (added by instrumentation) */
  trace_flags?: string;
}

/**
 * Device service data event - represents sensor readings and device state updates.
 *
 * This is the most common event type, containing real-time data from devices
 * like thermostats, humidity sensors, valve positions, etc.
 *
 * @example
 * ```json
 * {
 *   "@type": "DeviceServiceData",
 *   "id": "HumidityLevel",
 *   "deviceId": "hdm:ZigBee:001e5e0902b94515",
 *   "path": "/devices/hdm:ZigBee:001e5e0902b94515/services/HumidityLevel",
 *   "state": {
 *     "@type": "humidityLevelState",
 *     "humidity": 42.71
 *   }
 * }
 * ```
 */
export interface DeviceServiceDataEvent extends BaseEvent {
  '@type': 'DeviceServiceData';
  /** Service identifier (e.g., "HumidityLevel", "ValveTappet", "RoomClimateControl") */
  id: string;
  /** Device identifier */
  deviceId: string;
  /** API path to the device service */
  path: string;
  /**
   * Service state object with its own @type field.
   * Structure varies by service type (humidityLevelState, valveTappetState, etc.)
   */
  state?: Record<string, unknown>;
  /** Optional array of available operations for this service */
  operations?: string[];
  /** Optional fault information */
  faults?: {
    entries: {
      type: string;
      category: string;
      source?: {
        rootDeviceId: string;
        deviceId: string;
        deviceServiceId: string;
      };
    }[];
  };
}

/**
 * Device event - represents device metadata and configuration.
 *
 * Contains comprehensive information about a device including its model,
 * manufacturer, services, and relationships to other devices.
 *
 * @example
 * ```json
 * {
 *   "@type": "device",
 *   "id": "hdm:ZigBee:f0fd45fffe557345",
 *   "name": "EG WZ Thermostat 3",
 *   "deviceModel": "TRV_GEN2_DUAL",
 *   "manufacturer": "BOSCH",
 *   "serial": "F0FD45FFFE557345",
 *   "status": "AVAILABLE"
 * }
 * ```
 */
export interface DeviceEvent extends BaseEvent {
  '@type': 'device';
  /** Device identifier */
  id: string;
  /** Human-readable device name */
  name: string;
  /** Device model identifier */
  deviceModel: string;
  /** Device manufacturer (typically "BOSCH") */
  manufacturer: string;
  /** Device serial number */
  serial: string;
  /** Device status (e.g., "AVAILABLE", "UNDEFINED") */
  status: string;
  /** Root device identifier */
  rootDeviceId: string;
  /** Profile type (e.g., "GENERIC") */
  profile: string;
  /** Array of supported profile names */
  supportedProfiles: string[];
  /** Array of service identifiers this device provides */
  deviceServiceIds: string[];
  /** Array of child device identifiers */
  childDeviceIds: string[];
  /** Installation timestamp (Unix time in milliseconds) */
  installationTimestamp: number;
  /** Optional parent device identifier (for child devices) */
  parentDeviceId?: string;
  /** Optional associated room identifier */
  roomId?: string;
}

/**
 * Room event - represents room metadata updates.
 *
 * Contains information about rooms/zones in the smart home system.
 *
 * @example
 * ```json
 * {
 *   "@type": "room",
 *   "id": "hz_1",
 *   "name": "EG Wohnzimmer",
 *   "iconId": "icon_room_living_room",
 *   "extProperties": { "humidity": "42.71" }
 * }
 * ```
 */
export interface RoomEvent extends BaseEvent {
  '@type': 'room';
  /** Room identifier */
  id: string;
  /** Human-readable room name */
  name: string;
  /** Icon identifier for the room */
  iconId: string;
  /** Extended properties (key-value pairs, often includes aggregated sensor data) */
  extProperties?: Record<string, unknown>;
}

/**
 * Message event - represents system messages, notifications, and errors.
 *
 * Used for status updates, error notifications, and other system messages
 * from devices or the controller itself.
 *
 * @example
 * ```json
 * {
 *   "@type": "message",
 *   "id": "d88624d2-a2c4-49a9-9169-6591b395a141",
 *   "sourceId": "hdm:ZigBee:f0fd45fffe51fa08",
 *   "sourceType": "DEVICE",
 *   "sourceName": "UG Fitness Thermostat",
 *   "messageCode": {
 *     "name": "VALVE_NO_BODY_ERROR",
 *     "category": "ERROR"
 *   },
 *   "flags": ["STATUS", "STICKY"],
 *   "timestamp": 1765791587147
 * }
 * ```
 */
export interface MessageEvent extends BaseEvent {
  '@type': 'message';
  /** Message identifier (UUID) */
  id: string;
  /** Source device/entity identifier */
  sourceId: string;
  /** Source type (e.g., "DEVICE") */
  sourceType: string;
  /** Human-readable source name */
  sourceName: string;
  /** Message code with name and category */
  messageCode: {
    name: string;
    category: string;
  };
  /** Message flags (e.g., ["STATUS", "STICKY"]) */
  flags: string[];
  /** Message arguments/parameters */
  arguments: Record<string, unknown>;
  /** Message timestamp (Unix time in milliseconds) */
  timestamp: number;
}

/**
 * Client event - represents connected client applications (mobile apps, etc.)
 *
 * Contains information about client devices that have paired with the controller.
 *
 * @example
 * ```json
 * {
 *   "@type": "client",
 *   "id": "64D3FCCA-7AD5-4786-BDE6-F533EB989C92",
 *   "name": "iPhone Walter",
 *   "clientType": "MOBILE",
 *   "primaryRole": "ROLE_DEFAULT_CLIENT"
 * }
 * ```
 */
export interface ClientEvent extends BaseEvent {
  '@type': 'client';
  /** Client identifier (UUID) */
  id: string;
  /** Human-readable client name */
  name: string;
  /** Client type (e.g., "MOBILE") */
  clientType: string;
  /** Primary role */
  primaryRole: string;
  /** Array of role identifiers */
  roles: string[];
  /** Array of dynamic role identifiers */
  dynamicRoles: string[];
  /** App version */
  appVersion: string;
  /** Operating system (e.g., "IOS", "ANDROID") */
  os: string;
  /** OS version */
  osVersion: string;
  /** Client creation date */
  createdDate: string;
  /** Push notification token */
  pushNotificationToken?: string;
  /** Suppressed notifications */
  suppressedNotifications: unknown[];
}

/**
 * Discriminated union of all possible smart home event types.
 *
 * Use the `@type` field to narrow the type in conditionals:
 *
 * @example
 * ```typescript
 * function handleEvent(event: SmartHomeEvent) {
 *   switch (event["@type"]) {
 *     case "DeviceServiceData":
 *       // TypeScript knows event is DeviceServiceDataEvent here
 *       console.log(event.deviceId, event.state);
 *       break;
 *     case "device":
 *       // TypeScript knows event is DeviceEvent here
 *       console.log(event.name, event.deviceModel);
 *       break;
 *     case "room":
 *       // TypeScript knows event is RoomEvent here
 *       console.log(event.name, event.iconId);
 *       break;
 *     case "message":
 *       // TypeScript knows event is MessageEvent here
 *       console.log(event.messageCode.name);
 *       break;
 *     default:
 *       // Exhaustiveness check - ensures all cases are handled
 *       const _exhaustive: never = event;
 *       return _exhaustive;
 *   }
 * }
 * ```
 */
export type SmartHomeEvent =
  | DeviceServiceDataEvent
  | DeviceEvent
  | RoomEvent
  | MessageEvent
  | ClientEvent;
