# OpenTelemetry Reference Documentation

For implementation details and best practices, see the comprehensive [OpenTelemetry Best Practices Guide](https://www.elastic.co/docs/reference/opentelemetry/edot-sdks/node/setup) maintained by Elastic.

### Key Resources

- [EDOT Node.js Setup](https://www.elastic.co/docs/reference/opentelemetry/edot-sdks/node/setup)
- [EDOT Collector Configuration](https://www.elastic.co/docs/reference/opentelemetry/edot-collector)
- [Elastic OpenTelemetry Example Repository](https://github.com/elastic/elastic-otel-node-example)
- [pino-opentelemetry-transport](https://github.com/pinojs/pino-opentelemetry-transport)

### Architecture (as implemented)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Node.js Application                         │
│                        (yarn poll)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────┐    ┌─────────────────────────┐    │
│  │      EDOT Node.js       │    │   Pino Logger + OTel    │    │
│  │  (@elastic/otel-node)   │    │      Transport          │    │
│  │                         │    │                         │    │
│  │  • Auto-instrumentation │    │  • Structured logs      │    │
│  │  • Traces               │    │  • Trace correlation    │    │
│  │  • Metrics              │    │  • OTLP export          │    │
│  └───────────┬─────────────┘    └───────────┬─────────────┘    │
│              │                              │                   │
│              │    Traces & Metrics          │    Logs           │
│              └──────────────┬───────────────┘                   │
│                             │                                   │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                              ▼
               ┌──────────────────────────────┐
               │       EDOT Collector         │
               │    (localhost:4317/4318)     │
               │                              │
               │  • OTLP receiver (gRPC/HTTP) │
               │  • elasticapm processor      │
               │  • spanmetrics connector     │
               │  • Batch processing          │
               │  • Elasticsearch export      │
               └──────────────┬───────────────┘
                              │
                              ▼
               ┌──────────────────────────────┐
               │       Elasticsearch          │
               │                              │
               │  • traces-apm.otel-*         │
               │  • metrics-apm.otel-*        │
               │  • logs-apm.otel-*           │
               └──────────────┬───────────────┘
                              │
                              ▼
               ┌──────────────────────────────┐
               │          Kibana              │
               │                              │
               │  • APM UI (Services, Traces) │
               │  • Discover (raw data)       │
               │  • Dashboards                │
               └──────────────────────────────┘
```

### Current Configuration

The project uses:

- **EDOT Collector** (elastic/elastic-agent:9.2.2) with `elasticapm` processor and `spanmetrics` connector
- **Mapping mode**: `otel` (preserves OTel semantics for Stack 9.x)
- **Service naming**: Per-script (e.g., `shc2es-poll`, `shc2es-ingest`)
- **Log transport**: Pino with OTel transport for trace correlation
- **TLS**: Configurable via `OTEL_TLS_VERIFY` environment variable

### Environment Variables (configured)

```bash
# Service identification (set per-script in package.json)
OTEL_SERVICE_NAME=shc2es-poll

# OTLP endpoint (defaults to localhost:4318)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Resource attributes
OTEL_RESOURCE_ATTRIBUTES=service.version=1.0.0,deployment.environment=production

# Disable telemetry (for testing)
OTEL_SDK_DISABLED=true
```

### Yarn Commands (implemented)

```bash
# Collector management
yarn otel:collector:start    # Start EDOT Collector (Docker)
yarn otel:collector:stop     # Stop collector
yarn otel:collector:logs     # View collector logs

# Run without telemetry
yarn poll:no-otel            # Bypass auto-instrumentation
```

## Manual Instrumentation Examples

Beyond auto-instrumentation, the project includes manual span creation to track business logic performance using the `@opentelemetry/api` package.

### withSpan() Helper

The `withSpan()` helper (in `src/instrumentation.ts`) provides a convenient way to wrap operations in custom spans:

```typescript
import { withSpan, SpanAttributes } from './instrumentation';

// Synchronous operation
const result = withSpan('process_event', {
  [SpanAttributes.EVENT_TYPE]: 'DeviceServiceData',
  [SpanAttributes.DEVICE_ID]: 'device-123',
}, () => {
  // Your code here
  return processEvent(event);
});

// Asynchronous operation
const data = await withSpan('fetch_devices', {
  'devices.count': 10,
}, async () => {
  return await api.getDevices();
});
```

**Key features:**
- Automatically creates and activates span
- Sets span status (OK/ERROR) based on function result
- Records exceptions and ensures span ends even on error
- Supports both sync and async functions
- Returns the function's result value

### Instrumented Operations by Script

#### poll.ts - Event Collection

**Operations:**
- `subscribe` - Initial subscription to smart home controller
- `process_events` - Batch event processing (tracks event count)
- `process_event` - Individual event processing (tracks device ID and event type)

**Example spans in APM UI:**
```
subscribe
└─ process_events (event.count: 3)
   ├─ process_event (event.type: DeviceServiceData, device.id: hdm:ZigBee:abc123)
   ├─ process_event (event.type: DeviceServiceData, device.id: hdm:ZigBee:def456)
   └─ process_event (event.type: room, device.id: hz_1)
```

#### ingest.ts - Data Ingestion

**Operations:**
- `load_registry` - Loading device/room enrichment data
- `bulk_import_file` - Importing NDJSON file to Elasticsearch (tracks file path, document count, index name)
- `transform_document` - Transforming and enriching individual documents (tracks document type, device ID)

**Example spans in APM UI:**
```
bulk_import_file (file.path: events-2025-12-14.ndjson, documents.count: 150, index.name: smart-home-events-2025-12-14)
└─ transform_document (doc.type: DeviceServiceData, device.id: hdm:ZigBee:abc123)
   └─ transform_document (doc.type: room, device.id: hz_1)
   └─ ...
```

#### fetch-registry.ts - Registry Fetching

**Operations:**
- `fetch_devices` - API call to get all devices
- `fetch_rooms` - API call to get all rooms
- `build_registry` - Building registry JSON file (tracks device count, room count)

**Example spans in APM UI:**
```
fetch_devices
fetch_rooms
build_registry (devices.count: 15, rooms.count: 8)
```

#### export-dashboard.ts - Dashboard Export

**Operations:**
- `find_dashboard` - Searching for dashboard by name (tracks dashboard name)
- `export_dashboard` - Exporting dashboard NDJSON (tracks dashboard ID, name, object count)
- `strip_metadata` - Removing sensitive fields from export (tracks field count)

**Example spans in APM UI:**
```
find_dashboard (dashboard.name: shc2es)
export_dashboard (dashboard.id: abc123, dashboard.name: smart-home, objects.count: 12)
└─ strip_metadata (fields.count: 5)
```

### Span Attributes

Custom attributes follow OpenTelemetry semantic conventions where applicable. Project-specific attributes are defined in `SpanAttributes` constants:

| Attribute | Description | Example |
|-----------|-------------|---------|
| `event.type` | Smart home event type | `DeviceServiceData`, `room` |
| `event.count` | Number of events in batch | `3` |
| `device.id` | Bosch device identifier | `hdm:ZigBee:abc123` |
| `device.name` | Human-readable device name | `Living Room Thermostat` |
| `room.id` | Room identifier | `hz_1` |
| `room.name` | Room name | `Living Room` |
| `doc.type` | Document type | `DeviceServiceData` |
| `documents.count` | Batch document count | `150` |
| `index.name` | Elasticsearch index | `smart-home-events-2025-12-14` |
| `file.path` | File being processed | `events-2025-12-14.ndjson` |
| `dashboard.id` | Kibana dashboard ID | `abc123` |
| `dashboard.name` | Dashboard title | `Smart Home Events` |
| `objects.count` | Saved objects count | `12` |
| `devices.count` | Device count | `15` |
| `rooms.count` | Room count | `8` |

### Viewing Spans in Kibana APM UI

1. **Start the collector:**
   ```bash
   yarn otel:collector:start
   ```

2. **Run a script:**
   ```bash
   yarn poll              # Collect events
   yarn ingest            # Import to Elasticsearch
   yarn registry          # Fetch device registry
   yarn dashboard:export  # Export dashboard
   ```

3. **Navigate to Kibana APM:**
   - Go to **Observability → APM → Services**
   - Select service (e.g., `shc2es-poll`, `shc2es-ingest`, etc.)
   - Click **Traces** tab
   - Select a trace to see span waterfall

4. **Analyze spans:**
   - View duration of each operation
   - Check span attributes in the right panel
   - Look for errors (red spans)
   - Compare performance across multiple runs

### Adding Custom Spans

To add spans to your own code:

1. **Import the helper:**
   ```typescript
   import { withSpan, SpanAttributes } from './instrumentation';
   ```

2. **Wrap your operation:**
   ```typescript
   const result = await withSpan(
     'my_operation',           // Span name (shows in APM UI)
     {                        // Span attributes (for filtering/analysis)
       [SpanAttributes.DEVICE_ID]: deviceId,
       'custom.attribute': 'value',
     },
     async () => {
       // Your code here
       return await doWork();
     },
   );
   ```

3. **Best practices:**
   - Use descriptive span names (lowercase, underscore-separated)
   - Add relevant attributes for filtering and analysis
   - Keep spans focused on single logical operations
   - Nest spans for hierarchical operations
   - Don't over-instrument (span creation has overhead)
   - **Don't instrument control flow** (loops, recursion) - only business logic
   - For long-running loops: instrument the work, not the loop itself

### Performance Considerations

- Span creation adds ~0.1-1ms overhead per span
- Auto-instrumentation already covers HTTP/DB calls
- Use manual spans for business logic where latency matters
- Sampling can reduce overhead in high-volume scenarios (see Performance Tuning below)
