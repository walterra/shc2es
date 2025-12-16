# Logging Standards

This document defines logging conventions for the shc2es project, aligned with [Elastic Common Schema (ECS)](https://www.elastic.co/guide/en/ecs/current/index.html) for consistency with Elasticsearch, Kibana, and Elastic APM.

## Core Principles

### 1. Human-Readable Messages

**Log messages must be self-contained and informative without parsing JSON fields.**

The message string should tell the complete story. A developer or operator should understand what happened by reading the message alone.

```typescript
// ❌ BAD - Message is vague, requires parsing JSON to understand
log.info({ count: 42 }, 'Devices fetched');

// ✅ GOOD - Message is complete and informative
log.info({ 'device.count': 42 }, 'Fetched 42 devices from controller');
```

```typescript
// ❌ BAD - No context about what's happening
log.info({ filePath: '/data/events.ndjson' }, 'Importing file');

// ✅ GOOD - Clear action and context
log.info(
  { 'file.path': '/data/events.ndjson', 'elasticsearch.index': 'smart-home-events-2025-12-16' },
  'Importing /data/events.ndjson to index smart-home-events-2025-12-16',
);
```

**Guidelines:**

- Include key values in the message (counts, IDs, names, statuses)
- Use complete sentences or clear phrases
- Avoid abbreviations (except widely known like "ID", "API", "URL")
- Front-load important information ("Failed to connect..." not "Connection failed...")

### 2. ECS Field Naming

**Use ECS dotted notation for structured fields.**

ECS uses hierarchical field names with dots (e.g., `device.id`, `file.path`) rather than camelCase (`deviceId`, `filePath`). This enables:

- Consistent querying across Elastic Stack
- Automatic field categorization in Kibana
- Semantic meaning for field analyzers

#### Common ECS Fields We Use

| Category          | ECS Field             | Description                      | Example                                               |
| ----------------- | --------------------- | -------------------------------- | ----------------------------------------------------- |
| **Device**        | `device.id`           | Unique device identifier         | `"hdm:ZigBee:001e5e0902b94515"`                       |
|                   | `device.count`        | Number of devices                | `42`                                                  |
|                   | `device.name`         | Human-readable device name       | `"Living Room Thermostat"`                            |
| **Room**          | `room.id`             | Room identifier (custom field)   | `"hz_1"`                                              |
|                   | `room.name`           | Room name (custom field)         | `"Living Room"`                                       |
|                   | `room.count`          | Number of rooms (custom field)   | `5`                                                   |
| **Event**         | `event.type`          | Event type from smart home API   | `"DeviceServiceData"`                                 |
|                   | `event.count`         | Number of events processed       | `128`                                                 |
| **File**          | `file.path`           | Full file path                   | `"/Users/user/.shc2es/data/events-2025-12-16.ndjson"` |
|                   | `file.count`          | Number of files                  | `7`                                                   |
| **Error**         | `error.message`       | Error message string             | `"Connection refused"`                                |
|                   | `error.stack_trace`   | Full stack trace                 | `"Error: Connection refused\n  at ..."`               |
|                   | `error.type`          | Error class name                 | `"ConnectionError"`                                   |
|                   | `error.code`          | Error code (if available)        | `"ECONNREFUSED"`                                      |
| **URL**           | `url.full`            | Complete URL                     | `"https://192.168.1.10:8443"`                         |
| **Host**          | `host.ip`             | IP address                       | `"192.168.1.10"`                                      |
|                   | `host.name`           | Hostname                         | `"controller.local"`                                  |
| **Elasticsearch** | `elasticsearch.index` | Index name (custom)              | `"smart-home-events-2025-12-16"`                      |
| **Dashboard**     | `dashboard.id`        | Kibana dashboard ID (custom)     | `"smart-home-overview"`                               |
| **Subscription**  | `subscription.id`     | Polling subscription ID (custom) | `"abcd-1234-efgh-5678"`                               |
| **Trace**         | `trace.id`            | OpenTelemetry trace ID           | `"0af7651916cd43dd8448eb211c80319c"`                  |
|                   | `span.id`             | OpenTelemetry span ID            | `"b7ad6b7169203331"`                                  |

**Custom Fields:** Some fields (like `room.*`, `subscription.id`, `elasticsearch.index`, `dashboard.id`) are not in the official ECS spec but follow ECS naming conventions (dotted, lowercase, descriptive).

### 3. Error Serialization

**Always log errors with full context using the `serializeError()` helper.**

```typescript
// ❌ BAD - String representation loses context
log.error({ err: error.message }, 'Connection failed');

// ❌ BAD - Generic 'err' field, not ECS compliant
log.error({ err: error }, 'Connection failed');

// ✅ GOOD - Use serializeError helper for complete context
log.error(serializeError(error), 'Failed to connect to Elasticsearch at https://localhost:9200');
```

The `serializeError()` helper extracts:

- `error.message` - Human-readable error message
- `error.stack_trace` - Full stack trace for debugging
- `error.type` - Error class name (e.g., "ConnectionError")
- `error.code` - Error code if available (e.g., "ECONNREFUSED")
- `error.cause` - Nested cause if available (recursive serialization)

### 4. Correlation IDs

**Include trace context for distributed tracing when available.**

OpenTelemetry automatically adds `trace.id` and `span.id` to logs when instrumentation is enabled. For manual correlation:

```typescript
import { trace } from '@opentelemetry/api';

const span = trace.getActiveSpan();
if (span) {
  const spanContext = span.spanContext();
  log.info(
    {
      'trace.id': spanContext.traceId,
      'span.id': spanContext.spanId,
      'device.id': deviceId,
    },
    'Processing device event',
  );
}
```

## Field Mapping Reference

**Migration guide from old field names to ECS-compliant names:**

| Old Field        | New ECS Field                                         | Notes                                                    |
| ---------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| `err`            | `error.message`                                       | Use `serializeError()` for full context                  |
| `deviceId`       | `device.id`                                           |                                                          |
| `deviceCount`    | `device.count`                                        |                                                          |
| `deviceName`     | `device.name`                                         |                                                          |
| `roomId`         | `room.id`                                             | Custom field                                             |
| `roomName`       | `room.name`                                           | Custom field                                             |
| `roomCount`      | `room.count`                                          | Custom field                                             |
| `eventType`      | `event.type`                                          |                                                          |
| `count`          | Specific: `event.count`, `device.count`, `file.count` | Be explicit about what's being counted                   |
| `filePath`       | `file.path`                                           |                                                          |
| `certFile`       | `file.path`                                           |                                                          |
| `registryFile`   | `file.path`                                           |                                                          |
| `dataDir`        | `file.path`                                           |                                                          |
| `esNode`         | `url.full`                                            | Full Elasticsearch URL                                   |
| `kibanaNode`     | `url.full`                                            | Full Kibana URL                                          |
| `host`           | `host.ip` or `url.full`                               | Use `host.ip` for IP addresses, `url.full` for full URLs |
| `subscriptionId` | `subscription.id`                                     | Custom field                                             |
| `indexName`      | `elasticsearch.index`                                 | Custom field                                             |
| `dashboardId`    | `dashboard.id`                                        | Custom field                                             |
| `pipelineName`   | `elasticsearch.pipeline`                              | Custom field                                             |

## Code Examples

### Startup Messages

```typescript
// ❌ BAD
log.info('Starting ingestion');
log.info({ esNode: 'https://localhost:9200' }, 'Connected');

// ✅ GOOD
log.info('Starting Elasticsearch ingestion service');
log.info(
  { 'url.full': 'https://localhost:9200' },
  'Connected to Elasticsearch at https://localhost:9200',
);
```

### Processing Counts

```typescript
// ❌ BAD - What kind of count? Devices? Events? Files?
log.info({ count: 42 }, 'Processing complete');

// ✅ GOOD - Explicit about what was processed
log.info({ 'event.count': 42, 'device.count': 5 }, 'Processed 42 events from 5 devices');
```

### File Operations

```typescript
// ❌ BAD
log.info({ filePath: path }, 'Importing file');

// ✅ GOOD
log.info(
  {
    'file.path': '/Users/user/.shc2es/data/events-2025-12-16.ndjson',
    'elasticsearch.index': 'smart-home-events-2025-12-16',
    'file.size.bytes': 1048576,
  },
  'Importing /Users/user/.shc2es/data/events-2025-12-16.ndjson (1 MB) to index smart-home-events-2025-12-16',
);
```

### Error Handling

```typescript
// ❌ BAD - Loses error context
log.error({ err: error.message }, 'Failed to connect');

// ❌ BAD - Not ECS compliant
log.error({ err: error }, `Failed to connect: ${error.message}`);

// ✅ GOOD - Full error context with readable message
log.error(
  serializeError(error),
  `Failed to connect to Elasticsearch at https://localhost:9200: ${error.message}`,
);
```

### Device Events

```typescript
// ❌ BAD
log.debug({ eventType: type, deviceId: id }, 'Event received');

// ✅ GOOD
log.debug(
  {
    'event.type': 'DeviceServiceData',
    'device.id': 'hdm:ZigBee:001e5e0902b94515',
    'device.name': 'Living Room Thermostat',
  },
  'Received DeviceServiceData event from Living Room Thermostat',
);
```

## Validation

### Development Checks

During development, you can validate log field names:

```bash
# Search for old field names that should be migrated
grep -r "{ err:" src/
grep -r "deviceId:" src/
grep -r "filePath:" src/

# Should return no results when migration is complete
```

### Test Assertions

Tests should verify ECS field names:

```typescript
test('logs error with ECS fields', () => {
  const error = new Error('Connection failed');

  // Capture log output
  const logSpy = jest.spyOn(logger, 'error');

  logger.error(serializeError(error), 'Failed to connect');

  expect(logSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      'error.message': 'Connection failed',
      'error.type': 'Error',
      'error.stack_trace': expect.stringContaining('Error: Connection failed'),
    }),
    'Failed to connect',
  );
});
```

## Migration Checklist

When updating existing log statements:

1. ✅ Replace flat field names with ECS dotted notation
2. ✅ Make message self-contained and human-readable
3. ✅ Use `serializeError()` for all error objects
4. ✅ Be specific about counts (device.count, not count)
5. ✅ Include key values in the message string
6. ✅ Use complete URLs for API endpoints (url.full)
7. ✅ Update tests to expect new field names

## References

- [Elastic Common Schema (ECS) Documentation](https://www.elastic.co/guide/en/ecs/current/index.html)
- [ECS Field Reference](https://www.elastic.co/guide/en/ecs/current/ecs-field-reference.html)
- [Pino Logging Best Practices](https://getpino.io/#/docs/best-practices)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
