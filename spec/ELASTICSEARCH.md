# Elasticsearch Integration Spec

## Overview

Script to ingest smart home event data from NDJSON files in `./data/` into Elasticsearch for time-series analysis and visualization.

## Target Environment

- **Elasticsearch**: `https://<ip>:9200`
- **Auth**: Basic auth (`elastic` user)
- **TLS**: Self-signed certificate (skip verification)

## Architecture

```
./data/events-YYYY-MM-DD.ndjson
        │
        ▼
┌─────────────────────┐
│  src/ingest.ts      │
│  - Watch for files  │
│  - Tail new lines   │
│  - Bulk index to ES │
└─────────────────────┘
        │
        ▼
Elasticsearch (smart-home-events index)
```

## Dependencies

| Package                  | Version | Purpose                             |
| ------------------------ | ------- | ----------------------------------- |
| `@elastic/elasticsearch` | ^8.x    | Official ES client with bulk helper |
| `chokidar`               | ^4.x    | Watch for new/changed NDJSON files  |
| `split2`                 | ^4.x    | Stream NDJSON line-by-line          |
| `tail`                   | ^2.x    | Follow new lines in active files    |

## Index Configuration

### Index Name

`smart-home-events` (or use data streams for ILM)

### Ingest Pipeline

Create an ingest pipeline to add `event.ingested` timestamp on ingestion:

```json
PUT _ingest/pipeline/smart-home-events-pipeline
{
  "description": "Add event.ingested timestamp to smart home events",
  "processors": [
    {
      "set": {
        "field": "event.ingested",
        "value": "{{{_ingest.timestamp}}}"
      }
    }
  ]
}
```

### Index Mapping

Create the index with mapping before ingesting data:

```json
PUT smart-home-events
{
  "settings": {
    "index": {
      "default_pipeline": "smart-home-events-pipeline"
    }
  },
  "mappings": {
    "properties": {
      "@timestamp": { "type": "date" },
      "event": {
        "properties": {
          "ingested": { "type": "date" }
        }
      },
      "@type": { "type": "keyword" },
      "id": { "type": "keyword" },
      "deviceId": { "type": "keyword" },
      "path": { "type": "keyword" },
      "device": {
        "properties": {
          "name": { "type": "keyword" },
          "type": { "type": "keyword" }
        }
      },
      "room": {
        "properties": {
          "id": { "type": "keyword" },
          "name": { "type": "keyword" }
        }
      },
      "metric": {
        "properties": {
          "name": { "type": "keyword" },
          "value": { "type": "float" }
        }
      }
    }
  }
}
```

### Setup Script

Run before first ingestion (`yarn ingest:setup`):

```typescript
async function setup() {
  // Create ingest pipeline
  await client.ingest.putPipeline({
    id: "smart-home-events-pipeline",
    description: "Add event.ingested timestamp to smart home events",
    processors: [
      {
        set: {
          field: "event.ingested",
          value: "{{{_ingest.timestamp}}}",
        },
      },
    ],
  });

  // Create index with mapping
  await client.indices.create({
    index: INDEX_NAME,
    settings: {
      index: {
        default_pipeline: "smart-home-events-pipeline",
      },
    },
    mappings: {
      properties: {
        "@timestamp": { type: "date" },
        event: {
          properties: {
            ingested: { type: "date" },
          },
        },
        "@type": { type: "keyword" },
        id: { type: "keyword" },
        deviceId: { type: "keyword" },
        path: { type: "keyword" },
        device: {
          properties: {
            name: { type: "keyword" },
            type: { type: "keyword" },
          },
        },
        room: {
          properties: {
            id: { type: "keyword" },
            name: { type: "keyword" },
          },
        },
        metric: {
          properties: {
            name: { type: "keyword" },
            value: { type: "float" },
          },
        },
      },
    },
  });
}
```

### Device Registry

The ingest script loads device and room names from `data/device-registry.json` to enrich events with human-readable names. Generate this file by running:

```bash
yarn registry
```

Registry structure:
```json
{
  "fetchedAt": "2025-12-10T14:46:36.795Z",
  "devices": {
    "hdm:ZigBee:001e5e0902b94515": {
      "name": "EG WZ Room thermostat",
      "roomId": "hz_1",
      "type": "RTH2_BAT"
    }
  },
  "rooms": {
    "hz_1": {
      "name": "EG Wohnzimmer",
      "iconId": "icon_room_living_room"
    }
  }
}
```

Re-run `yarn registry` when devices are added/removed/renamed.

### Document Transform

The Bosch Smart Home API produces two event types that need different handling:

#### Event Type: DeviceServiceData

Source NDJSON:

```json
{
  "time": "2025-12-10T10:18:49.923Z",
  "path": "/devices/hdm:ZigBee:001e5e0902b94515/services/HumidityLevel",
  "@type": "DeviceServiceData",
  "id": "HumidityLevel",
  "state": { "@type": "humidityLevelState", "humidity": 42.71 },
  "deviceId": "hdm:ZigBee:001e5e0902b94515"
}
```

Indexed document (after transform + pipeline + enrichment):

```json
{
  "@timestamp": "2025-12-10T10:18:49.923Z",
  "event": { "ingested": "2025-12-10T11:30:00.000Z" },
  "path": "/devices/hdm:ZigBee:001e5e0902b94515/services/HumidityLevel",
  "@type": "DeviceServiceData",
  "id": "HumidityLevel",
  "deviceId": "hdm:ZigBee:001e5e0902b94515",
  "device": { "name": "EG WZ Room thermostat", "type": "RTH2_BAT" },
  "room": { "id": "hz_1", "name": "EG Wohnzimmer" },
  "metric": { "name": "humidity", "value": 42.71 }
}
```

#### Event Type: room

Source NDJSON:

```json
{
  "time": "2025-12-10T10:18:49.938Z",
  "iconId": "icon_room_living_room",
  "extProperties": { "humidity": "42.71" },
  "@type": "room",
  "name": "EG Wohnzimmer",
  "id": "hz_1"
}
```

Indexed document (after transform + pipeline + enrichment):

```json
{
  "@timestamp": "2025-12-10T10:18:49.938Z",
  "event": { "ingested": "2025-12-10T11:30:00.000Z" },
  "@type": "room",
  "id": "hz_1",
  "room": { "id": "hz_1", "name": "EG Wohnzimmer" },
  "metric": { "name": "humidity", "value": 42.71 }
}
```

#### Transform Rules

1. Rename `time` to `@timestamp` for ES time-series conventions
2. `event.ingested` added automatically by ingest pipeline
3. Extract numeric values from `state` or `extProperties` into normalized `metric.name`/`metric.value`
4. Remove original `state` and `extProperties` after extraction (avoid field explosion)
5. Enrich with `device.name`, `device.type`, `room.id`, `room.name` from device registry

#### Metric Extraction Logic

```typescript
function extractMetric(doc: SmartHomeEvent): { name: string; value: number } | null {
  // DeviceServiceData: extract from state object
  if (doc.state && typeof doc.state === 'object') {
    for (const [key, val] of Object.entries(doc.state)) {
      if (key !== '@type' && typeof val === 'number') {
        return { name: key, value: val };
      }
    }
  }
  // room: extract from extProperties (values are strings)
  if (doc.extProperties && typeof doc.extProperties === 'object') {
    for (const [key, val] of Object.entries(doc.extProperties)) {
      const num = parseFloat(String(val));
      if (!isNaN(num)) {
        return { name: key, value: num };
      }
    }
  }
  return null;
}
```

#### Benefits of Normalized Metrics

| Aspect | Nested `state.temperature` | Normalized `metric.name/value` |
|--------|---------------------------|-------------------------------|
| Querying | `state.temperature: >20` | `metric.name: temperature AND metric.value: >20` |
| Aggregations | Separate agg per field | Single agg on `metric.value`, group by `metric.name` |
| Kibana Lens | Multiple Y-axes needed | Easy breakdown by `metric.name` |
| Mapping | Dynamic (field explosion risk) | Fixed schema |
| New sensors | May cause mapping conflicts | Just works |

## Script Modes

### 1. Batch Import (`yarn ingest`)

One-time import of all existing NDJSON files:

- Glob `./data/events-*.ndjson`
- Stream each file through `split2`
- Use ES bulk helper for efficient indexing
- Report count of indexed documents

### 2. Live Tail (`yarn ingest --watch`)

Continuous ingestion of new events:

- Use `chokidar` to watch `./data/` for new files
- Use `tail` to follow active files for new lines
- Index each new event as it arrives
- Handle daily file rotation (new file each day)

## Implementation

### File: `src/ingest.ts`

```typescript
import { Client } from "@elastic/elasticsearch";
import { createReadStream } from "fs";
import { glob } from "glob";
import split from "split2";
import chokidar from "chokidar";
import Tail from "tail";

if (!process.env.ES_NODE || !process.env.ES_PASSWORD) {
  console.error("ES_NODE and ES_PASSWORD must be set in .env");
  process.exit(1);
}

const client = new Client({
  node: process.env.ES_NODE,
  auth: {
    username: process.env.ES_USER || "elastic",
    password: process.env.ES_PASSWORD,
  },
  tls: { rejectUnauthorized: false },
});

const INDEX_NAME = "smart-home-events";

function transformDoc(doc: Record<string, unknown>) {
  const { time, ...rest } = doc;
  return {
    "@timestamp": time,
    ...rest,
  };
}

async function bulkImport(filePath: string) {
  const result = await client.helpers.bulk({
    datasource: createReadStream(filePath).pipe(split(JSON.parse)),
    onDocument(doc) {
      return {
        index: { _index: INDEX_NAME },
      };
    },
    onDrop(doc) {
      console.error("Failed to index:", doc);
    },
  });
  return result;
}

async function watchAndTail() {
  const watcher = chokidar.watch("./data/events-*.ndjson", {
    persistent: true,
    ignoreInitial: false,
  });

  watcher.on("add", (filePath) => {
    const tail = new Tail.Tail(filePath, { fromBeginning: false });
    tail.on("line", async (line: string) => {
      try {
        const doc = transformDoc(JSON.parse(line));
        await client.index({ index: INDEX_NAME, document: doc });
      } catch (err) {
        console.error("Index error:", err);
      }
    });
  });
}
```

## Environment Variables

Add to `.env` (required):

```bash
# Elasticsearch connection
ES_NODE=https://<ip>:9200
ES_USER=elastic
ES_PASSWORD=<password>
```

All ES configuration comes from environment variables - no hardcoded values in code.

## Commands

Add to `package.json`:

```json
{
  "scripts": {
    "ingest:setup": "ts-node src/ingest.ts --setup",
    "ingest": "ts-node src/ingest.ts",
    "ingest:watch": "ts-node src/ingest.ts --watch"
  }
}
```

### Workflow

1. `yarn ingest:setup` - Create pipeline and index (run once)
2. `yarn ingest` - Batch import existing NDJSON files
3. `yarn ingest:watch` - Tail new events in real-time

## Deduplication Strategy

To avoid duplicate documents on restart, use deterministic `_id` based on event type and entity:

```typescript
function generateDocId(doc: SmartHomeEvent): string {
  // Use deviceId for DeviceServiceData, or id (room id like hz_1) for room events
  const entityId = doc.deviceId || doc.id || 'unknown';
  return `${doc['@type']}-${entityId}-${doc.time}`;
}
```

Example IDs:
- `DeviceServiceData-hdm:ZigBee:001e5e0902b94515-2025-12-10T10:18:49.923Z`
- `room-hz_1-2025-12-10T10:18:49.938Z`

## Error Handling

- Retry on transient ES failures (bulk helper handles this)
- Log dropped documents via `onDrop` callback
- Graceful shutdown on SIGINT (flush pending bulk operations)

## Future Considerations

- **Data Streams**: Use ES data streams with ILM for automatic rollover
- **Kibana Dashboards**: Pre-built visualizations for temperature, humidity, valve position
- **Alerting**: ES Watcher rules for anomaly detection (e.g., valve stuck open)

## References

- [@elastic/elasticsearch npm](https://www.npmjs.com/package/@elastic/elasticsearch)
- [Bulk Helper Docs](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/bulk_examples.html)
- [Chokidar](https://github.com/paulmillr/chokidar)
