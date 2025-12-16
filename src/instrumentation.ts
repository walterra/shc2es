/**
 * OpenTelemetry Manual Instrumentation Utilities
 *
 * Provides helpers for creating custom spans to track business logic performance.
 * Works alongside auto-instrumentation from @elastic/opentelemetry-node.
 *
 * @example
 * ```typescript
 * import { withSpan } from './instrumentation';
 *
 * // Synchronous operation
 * const result = withSpan('process_event', { 'event.type': 'DeviceServiceData' }, () => {
 *   return processEvent(event);
 * });
 *
 * // Asynchronous operation
 * const data = await withSpan('fetch_devices', { 'devices.count': 10 }, async () => {
 *   return await api.getDevices();
 * });
 * ```
 */

import type { Span, Attributes } from '@opentelemetry/api';
import { trace, SpanStatusCode } from '@opentelemetry/api';

// Get tracer for this service
// Note: Service name is set via OTEL_SERVICE_NAME in package.json scripts
// Export for testing purposes
export const tracer = trace.getTracer('shc2es');

/**
 * Execute a function within a custom span.
 *
 * Automatically handles:
 * - Span creation and activation
 * - Error recording (sets span status to ERROR and records exception)
 * - Span ending (always, even on exception)
 *
 * @param operationName - Name of the span (e.g., 'process_event', 'transform_document')
 * @param attributes - Span attributes following OpenTelemetry semantic conventions
 * @param fn - Function to execute within the span (sync or async)
 * @returns Result of the function
 *
 * @throws Re-throws any exception from the function after recording it in the span
 */
export function withSpan<T>(
  operationName: string,
  attributes: Attributes,
  fn: (span: Span) => T,
): T {
  return tracer.startActiveSpan(operationName, { attributes }, (span) => {
    try {
      const result = fn(span);

      // If result is a Promise, handle async error cases
      if (result instanceof Promise) {
        // Type assertion: Promise<unknown> is returned, caller expects Promise in T
        return result
          .then((value: unknown) => {
            span.setStatus({ code: SpanStatusCode.OK });
            return value;
          })
          .catch((error: unknown) => {
            span.recordException(error instanceof Error ? error : new Error(String(error)));
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
          })
          .finally(() => {
            span.end();
          }) as T;
      }

      // Synchronous success
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    } catch (error) {
      // Synchronous error
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      throw error;
    }
  });
}

/**
 * Common span attribute names following OpenTelemetry semantic conventions.
 *
 * See: https://opentelemetry.io/docs/specs/semconv/
 *
 * Custom attributes for smart home domain:
 * - event.type: Type of smart home event (e.g., 'DeviceServiceData', 'room')
 * - event.count: Number of events processed in batch
 * - device.id: Bosch device identifier
 * - device.name: Human-readable device name
 * - room.id: Room identifier
 * - room.name: Room name
 * - doc.type: Document type being processed
 * - documents.count: Number of documents in batch operation
 * - index.name: Elasticsearch index name
 * - file.path: File path being processed
 * - dashboard.id: Kibana dashboard ID
 * - dashboard.name: Dashboard title/name
 * - objects.count: Number of saved objects
 *
 * Standard OpenTelemetry attributes:
 * - http.method: HTTP method (GET, POST, etc.)
 * - http.status_code: HTTP response status
 * - http.url: HTTP request URL
 * - error: Boolean indicating error occurred
 * - error.type: Type/class of error
 */
export const SpanAttributes = {
  // Event attributes
  EVENT_TYPE: 'event.type',
  EVENT_COUNT: 'event.count',

  // Device attributes
  DEVICE_ID: 'device.id',
  DEVICE_NAME: 'device.name',

  // Room attributes
  ROOM_ID: 'room.id',
  ROOM_NAME: 'room.name',

  // Document attributes
  DOC_TYPE: 'doc.type',
  DOCUMENTS_COUNT: 'documents.count',

  // Elasticsearch attributes
  INDEX_NAME: 'index.name',

  // File attributes
  FILE_PATH: 'file.path',

  // Dashboard attributes
  DASHBOARD_ID: 'dashboard.id',
  DASHBOARD_NAME: 'dashboard.name',
  OBJECTS_COUNT: 'objects.count',

  // Generic attributes
  OPERATION: 'operation',
  ERROR: 'error',
  ERROR_TYPE: 'error.type',
} as const;
