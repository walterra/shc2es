# OpenTelemetry to Elasticsearch Best Practices (2025)

This document covers best practices for instrumenting Node.js processes with OpenTelemetry and sending telemetry data to Elasticsearch/Elastic Observability.

## Architecture Overview

The complete observability stack for this project:

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
               │  • traces-*.otel-*           │
               │  • metrics-*.otel-*          │
               │  • logs-*.otel-*             │
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

### Data Flow Summary

| Signal  | Source                      | Transport                              | Index Pattern        |
|---------|-----------------------------|----------------------------------------|----------------------|
| Traces  | EDOT SDK auto-instrumentation | OTLP → elasticapm → ES               | `traces-*.otel-*`    |
| Metrics | EDOT SDK + spanmetrics      | OTLP → spanmetrics → ES                | `metrics-*.otel-*`   |
| Logs    | Pino + OTel Transport       | OTLP → Collector → ES                  | `logs-*.otel-*`      |

**Note:** The `elasticapm` processor and `spanmetrics` connector are required for Kibana APM UI compatibility. See [Kibana APM UI Requirements](#kibana-apm-ui-requirements) for details.

## Recommended Approach: EDOT Node.js

The **Elastic Distribution of OpenTelemetry Node.js** (`@elastic/opentelemetry-node`) is the recommended approach for 2025. It's a lightweight wrapper around the OpenTelemetry SDK with Elastic-optimized defaults.

### Why EDOT Over Upstream OpenTelemetry?

| Feature                | EDOT Node.js                     | Upstream OTel          |
| ---------------------- | -------------------------------- | ---------------------- |
| Metric temporality     | Delta (better for Elasticsearch) | Cumulative             |
| Host metrics           | Enabled by default               | Requires manual setup  |
| OpenAI instrumentation | Included                         | Separate package       |
| ESM support            | Improved handling                | Standard               |
| Central configuration  | Supported (Kibana 9.3+)          | Not available          |
| Elastic bug fixes      | Early access                     | Upstream release cycle |

## Installation

```bash
npm install --save @elastic/opentelemetry-node
```

**Requirements:** Node.js 18.19.0+, 20.6.0+, or later

## Configuration

### Environment Variables

| Variable                             | Purpose                   | Default                 |
| ------------------------------------ | ------------------------- | ----------------------- |
| `OTEL_SERVICE_NAME`                  | Service identifier        | `unknown-node-service`  |
| `OTEL_EXPORTER_OTLP_ENDPOINT`        | Telemetry destination URL | `http://localhost:4318` |
| `OTEL_EXPORTER_OTLP_HEADERS`         | Authentication headers    | None                    |
| `OTEL_EXPORTER_OTLP_PROTOCOL`        | Export protocol           | `http/proto`            |
| `OTEL_RESOURCE_ATTRIBUTES`           | Service metadata          | None                    |
| `ELASTIC_OTEL_HOST_METRICS_DISABLED` | Toggle host metrics       | `false`                 |

### Example Configuration

```bash
export OTEL_SERVICE_NAME="shc2es-poll"
export OTEL_EXPORTER_OTLP_ENDPOINT="https://your-deployment.apm.region.cloud.es.io"
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer YOUR_APM_SECRET_TOKEN"
export OTEL_RESOURCE_ATTRIBUTES="service.version=1.0.0,deployment.environment=production"
```

## Running Your Application

### Zero-Code Instrumentation (Recommended)

No code changes required - use Node.js CLI flags:

```bash
# ES Modules (Node.js 20+)
node --import @elastic/opentelemetry-node app.js

# CommonJS
node --require @elastic/opentelemetry-node app.js
```

### Package.json Integration

```json
{
  "scripts": {
    "start": "node --import @elastic/opentelemetry-node src/poll.ts",
    "start:otel": "node --env-file .env --import @elastic/opentelemetry-node dist/poll.js"
  }
}
```

### Docker Configuration

```dockerfile
FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .

RUN npm install --save @elastic/opentelemetry-node

ENV OTEL_SERVICE_NAME="my-service"

CMD ["node", "--import", "@elastic/opentelemetry-node", "dist/app.js"]
```

## Auto-Instrumented Libraries

EDOT Node.js automatically captures telemetry from:

### Web Frameworks

- Express
- Fastify
- Hapi
- Koa
- NestJS

### Databases

- MongoDB
- PostgreSQL
- MySQL
- Redis
- Cassandra

### Messaging

- RabbitMQ (AMQP)
- Kafka

### HTTP/Network

- HTTP/HTTPS clients
- gRPC
- DNS

### Logging

- Winston
- Bunyan
- Pino

### Cloud & AI

- AWS SDK
- OpenAI client library

## Manual Instrumentation

For custom code not covered by auto-instrumentation:

```typescript
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("my-service");

async function processSmartHomeEvent(event: SmartHomeEvent) {
  return tracer.startActiveSpan("process-smart-home-event", async (span) => {
    try {
      span.setAttribute("device.id", event.deviceId);
      span.setAttribute("event.type", event.type);

      // Your processing logic here
      const result = await handleEvent(event);

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

## Best Practices

### 1. Start with Auto-Instrumentation

Begin with zero-code instrumentation. Add manual spans only for:

- Custom business logic
- Unsupported libraries
- Fine-grained performance tracking

### 2. Set Resource Attributes Consistently

Always configure these across all services:

- `service.name` - Unique service identifier
- `service.version` - Semantic version
- `deployment.environment` - production, staging, development

### 3. Use OpenTelemetry Collector in Production

For Kubernetes/containerized environments, deploy the OTel Collector:

```
Application → OTel Collector → Elastic APM
```

Benefits:

- Centralized processing and transformation
- Kubernetes metadata enrichment
- Reduced application overhead
- Secret management simplification

### 4. Direct Export for Development

Skip the collector locally for simplicity:

```
Application → Elastic APM (direct OTLP)
```

### 5. Instrument Strategically

- **Do** instrument meaningful operations (API calls, database queries, business logic)
- **Don't** instrument trivial utility functions called extensively
- **Do** add context with span attributes
- **Don't** over-instrument - it adds overhead

### 6. Use Batch Processing

For production, batch processing is more efficient than synchronous export:

```bash
export OTEL_BSP_SCHEDULE_DELAY=5000  # Batch delay in ms
export OTEL_BSP_MAX_EXPORT_BATCH_SIZE=512
```

## Logging Integration

Send Pino logs directly to the OTel Collector using `pino-opentelemetry-transport`.

### Installation

```bash
npm install --save pino pino-opentelemetry-transport
```

### Configuration

Add the OTel transport to your Pino logger targets:

```typescript
import pino from "pino";

const OTEL_LOGS_ENABLED = process.env.OTEL_SDK_DISABLED !== "true";

// Build transport targets array
const loggerTargets: pino.TransportTargetOptions[] = [
  // Console output (pretty in dev)
  {
    target: "pino-pretty",
    options: { colorize: true },
    level: "info",
  },
  // File output (JSON)
  {
    target: "pino/file",
    options: { destination: "./logs/app.log" },
    level: "info",
  },
];

// Add OpenTelemetry transport if enabled
if (OTEL_LOGS_ENABLED) {
  loggerTargets.push({
    target: "pino-opentelemetry-transport",
    options: {
      // Uses OTEL_EXPORTER_OTLP_ENDPOINT or defaults to http://localhost:4318
    },
    level: "info",
  });
}

export const logger = pino({
  name: "my-service",
  level: "info",
  transport: {
    targets: loggerTargets,
  },
});
```

### How It Works

- **Automatic OTLP export**: Logs are sent to `http://localhost:4318/v1/logs` by default
- **Trace correlation**: If a span is active, trace/span IDs are automatically included
- **Resource attributes**: Inherits `OTEL_SERVICE_NAME` and other OTel env vars
- **Graceful fallback**: If OTel is disabled, logs still go to console/file

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector endpoint | `http://localhost:4318` |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | Logs-specific endpoint | Falls back to above |
| `OTEL_SERVICE_NAME` | Service name in logs | `unknown_service` |
| `OTEL_SDK_DISABLED` | Disable OTel entirely | `false` |

## OTLP Endpoint Options

You need an OTLP endpoint to receive telemetry data. Here are your options:

### Option 1: Elastic Cloud (Easiest)

If you have an Elastic Cloud deployment, it already includes an OTLP endpoint:

**Kibana → Observability → APM → Add data → OpenTelemetry**

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://<deployment-id>.apm.<region>.cloud.es.io
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <your-secret-token>
```

No collector needed - send directly from your application.

### Option 2: EDOT Collector (Recommended for Self-Managed)

The **EDOT Collector** (Elastic Distribution of OpenTelemetry Collector) is Elastic's distribution, optimized for Elasticsearch. It went GA in 2025.

#### Bundling EDOT Collector with Your Project

You can make the EDOT Collector part of your project by adding yarn commands that run Docker:

```json
{
  "scripts": {
    "otel:collector": "docker run --rm -p 4317:4317 -p 4318:4318 -v $(pwd)/otel-collector-config.yml:/etc/otelcol-contrib/config.yaml -e ELASTIC_AGENT_OTEL=true elastic/elastic-agent:9.2.2",
    "otel:collector:start": "docker compose -f docker-compose.otel.yml up -d",
    "otel:collector:stop": "docker compose -f docker-compose.otel.yml down"
  }
}
```

**Pros of bundling:**
- Self-contained - everything needed is in the repo
- Easy onboarding - just `yarn otel:collector:start` then `yarn poll`
- Consistent configuration across environments
- Version-controlled collector config

**Cons of bundling:**
- Requires Docker installed
- Adds complexity if using Elastic Cloud (direct endpoint is simpler)
- Need to manage collector config files in the repo

**Recommendation:**
- **Elastic Cloud users**: Skip the collector, use direct OTLP endpoint
- **Self-managed Elasticsearch**: Bundle the collector for a complete setup

#### EDOT Collector vs Plain OpenTelemetry Collector

| Feature | EDOT Collector | Plain OTel Collector |
|---------|----------------|----------------------|
| Elastic-optimized exporters | Yes | Manual config |
| Kubernetes metadata enrichment | Built-in | Manual setup |
| Enterprise support from Elastic | Yes | Community only |
| Pre-tuned for Elastic Observability | Yes | No |
| Proactive bug fixes | Yes | Standard release cycle |
| **Kibana APM UI support** | **Yes (with elasticapm)** | **No** |

#### Kibana APM UI Requirements

To use the Kibana APM UI (Services, Traces, Service Maps) with EDOT Collector sending directly to Elasticsearch, you **must** use Elastic-specific components that are only available in the EDOT Collector:

| Component | Purpose | Required For |
|-----------|---------|--------------|
| `elasticapm` processor | Enriches traces with Elastic-specific attributes | APM UI trace visualization |
| `spanmetrics` connector | Generates pre-aggregated APM metrics from traces | Service maps, latency histograms, throughput charts |

**Why these components are required:**

Without `elasticapm` and `spanmetrics`, trace data lands in `traces-generic-*` indices with raw OTel format. The Kibana APM UI expects:
- Enriched trace attributes for proper service/transaction grouping
- Pre-aggregated metrics for dashboards (latency percentiles, throughput, error rates)

**Version compatibility:**

| Elastic Stack | EDOT Collector | Processor to use |
|---------------|----------------|------------------|
| 9.x | 9.x | `elasticapm` |
| 8.18, 8.19 | 9.x | `elastictrace` (deprecated) |

**Important:** The `elasticapm` processor and `spanmetrics` connector are **not** included in the upstream OpenTelemetry Collector Contrib distribution. You must use EDOT Collector for Kibana APM UI compatibility.

#### Docker Setup

**1. Create `otel-collector-config.yml`:**

```yaml
# EDOT Collector Configuration for Kibana APM UI
# See: https://www.elastic.co/docs/reference/opentelemetry/edot-collector
#
# Required components for APM UI:
# - elasticapm processor: enriches traces for APM UI compatibility
# - spanmetrics connector: generates APM metrics from traces

receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 5s
    send_batch_size: 1000

  # Required for Kibana APM UI - enriches traces with Elastic-specific attributes
  elasticapm: {}

connectors:
  # Required for Kibana APM UI - generates APM metrics from traces
  # (latency histograms, throughput, service maps)
  spanmetrics:

exporters:
  debug:
    verbosity: basic

  # Elasticsearch exporter with OTel-native mapping
  elasticsearch/otel:
    endpoints: ["${env:ES_NODE}"]
    api_key: ${env:ELASTIC_API_KEY}
    mapping:
      mode: otel  # Preserves OTel semantics (recommended for Stack 9.x)
    logs_dynamic_index:
      enabled: true
    metrics_dynamic_index:
      enabled: true
    traces_dynamic_index:
      enabled: true
    tls:
      insecure_skip_verify: true  # For self-signed certs in development

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch, elasticapm]
      exporters: [debug, spanmetrics, elasticsearch/otel]

    # Metrics pipeline receives both direct metrics AND generated APM metrics
    metrics:
      receivers: [otlp, spanmetrics]
      processors: [batch]
      exporters: [debug, elasticsearch/otel]

    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug, elasticsearch/otel]
```

**Key configuration notes:**
- `elasticapm: {}` processor enriches traces for Kibana APM UI compatibility
- `spanmetrics` connector generates APM metrics (latency, throughput) from traces
- `spanmetrics` appears in traces exporters (source) AND metrics receivers (sink)
- `mapping.mode: otel` preserves OTel-native format (recommended for Stack 9.x)
- Uses `${env:VAR_NAME}` syntax for environment variable expansion
- `tls.insecure_skip_verify: true` needed for self-signed certs (remove in production)

**2. Create `docker-compose.otel.yml`:**

```yaml
services:
  otel-collector:
    image: elastic/elastic-agent:9.2.2
    container_name: otel-collector
    command: otel --config /etc/otel-collector/config.yaml
    deploy:
      resources:
        limits:
          memory: 1.5G
    restart: unless-stopped
    user: "0:0"
    ports:
      - "4317:4317"  # OTLP gRPC
      - "4318:4318"  # OTLP HTTP
    env_file:
      - .env
    volumes:
      - ./otel-collector-config.yml:/etc/otel-collector/config.yaml:ro
```

**Key docker-compose notes:**
- `command: otel --config ...` runs elastic-agent in pure OTel collector mode
- `env_file: .env` passes all environment variables to the container
- Port mapping exposes OTLP endpoints to the host

**3. Add to `.env`:**

```bash
# Elasticsearch connection (used by collector)
ES_NODE=https://192.168.1.140:9200
ELASTIC_API_KEY=your_api_key_here

# OpenTelemetry service identification
OTEL_SERVICE_NAME=shc2es
```

**4. Add yarn scripts to `package.json`:**

```json
{
  "scripts": {
    "otel:collector": "docker run --rm -p 4317:4317 -p 4318:4318 --env-file .env -v $(pwd)/otel-collector-config.yml:/etc/otel-collector/config.yaml elastic/elastic-agent:9.2.2 otel --config /etc/otel-collector/config.yaml",
    "otel:collector:start": "docker compose -f docker-compose.otel.yml up -d",
    "otel:collector:stop": "docker compose -f docker-compose.otel.yml down",
    "otel:collector:logs": "docker compose -f docker-compose.otel.yml logs -f"
  }
}
```

**5. Run:**

```bash
# Start the collector (background)
yarn otel:collector:start

# Check collector logs
yarn otel:collector:logs

# Run your instrumented application
yarn poll

# Stop when done
yarn otel:collector:stop
```

**6. Verify data in Elasticsearch:**

```bash
# Check indices were created
curl -k -u elastic:$ES_PASSWORD "$ES_NODE/_cat/indices/*otel*?v"

# Expected output (with elasticapm + signaltometrics):
# traces-apm.otel-default    - enriched trace spans
# metrics-apm.otel-default   - APM metrics (latency, throughput)
# logs-apm.otel-default      - application logs
```

### Option 3: Plain OpenTelemetry Collector

If you prefer the upstream collector without Elastic's distribution:

```bash
# macOS
brew install open-telemetry/opentelemetry-collector/opentelemetry-collector

# Or Docker
docker run -p 4317:4317 -p 4318:4318 \
  -v $(pwd)/otel-collector-config.yaml:/etc/otelcol/config.yaml \
  otel/opentelemetry-collector:latest
```

### Option 4: Disable Telemetry

If you don't need APM:

```bash
export OTEL_SDK_DISABLED=true
yarn poll
```

Or use the no-otel script:

```bash
yarn poll:no-otel
```

## Alternative: Upstream OpenTelemetry SDK

If you prefer standard OpenTelemetry without Elastic's SDK distribution:

```bash
npm install --save @opentelemetry/api @opentelemetry/auto-instrumentations-node
```

```bash
node --require @opentelemetry/auto-instrumentations-node/register app.js
```

Elastic accepts OTLP natively, so this works but lacks EDOT's optimizations.

## Kibana Onboarding

To get the best experience with OTel data in Kibana, install the content integrations that provide dashboards and proper index templates.

### Install OTel Integrations

1. **Go to Kibana → Integrations** (or search "Integrations" in global search)
2. **Search for "otel"**
3. **Install these content packs:**
   - **APM** - Service maps, traces view, latency metrics
   - **System OpenTelemetry Assets** - Host metrics dashboards
   - Other `*_otel` integrations relevant to your stack

### What the Integrations Provide

| Integration | Assets |
|-------------|--------|
| APM | Service map, traces UI, transaction analysis |
| System OpenTelemetry Assets | Host CPU, memory, disk dashboards |
| Docker OpenTelemetry Assets | Container metrics dashboards |

### Create Data Views

If data views aren't created automatically:

1. **Kibana → Stack Management → Data Views**
2. Create views for:
   - `traces-*` - Trace spans
   - `metrics-*` - Metrics data
   - `logs-*` - Application logs

### Verify in Kibana

- **Observability → APM → Services** - Your service should appear
- **Discover** - Browse raw traces, metrics, logs
- **Dashboards** - Pre-built OTel dashboards (after installing integrations)

## Elastic APM Features

Once configured, you gain access to:

- **Service maps** - Visualize service dependencies
- **Distributed tracing** - Follow requests across services
- **Latency metrics** - P50, P95, P99 response times
- **Transaction analysis** - Breakdown by endpoint
- **ML-powered correlations** - Automatic anomaly detection
- **Log correlation** - Link logs to traces

## Testing Locally

Use the MockOTLPServer for local development:

```bash
npm install --save-dev @elastic/mockotlpserver

# Terminal 1: Start mock server
npx @elastic/mockotlpserver

# Terminal 2: Run your app
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
node --import @elastic/opentelemetry-node app.js
```

## Troubleshooting

### Enable Debug Logging

```bash
export OTEL_LOG_LEVEL=debug
```

### Verify Telemetry Export

Check that spans are being sent:

```bash
export OTEL_TRACES_EXPORTER=console
```

### Common Issues

| Issue             | Solution                                                |
| ----------------- | ------------------------------------------------------- |
| No data in Kibana | Verify `OTEL_EXPORTER_OTLP_ENDPOINT` and authentication |
| Missing spans     | Check if library is in supported list                   |
| High overhead     | Reduce instrumentation scope, use sampling              |
| ESM errors        | Use `--import` flag (not `--require`) for ES modules    |

## References

### EDOT Node.js SDK

- [EDOT Node.js Setup Documentation](https://www.elastic.co/docs/reference/opentelemetry/edot-sdks/node/setup)
- [EDOT Node.js Release Notes](https://www.elastic.co/docs/release-notes/edot/sdks/node)
- [Elastic OpenTelemetry Node Example Repository](https://github.com/elastic/elastic-otel-node-example)
- [Auto-instrumentation with OpenTelemetry for Node.js](https://www.elastic.co/observability-labs/blog/auto-instrument-nodejs-apps-opentelemetry)

### EDOT Collector

- [EDOT Collector Documentation](https://www.elastic.co/docs/reference/opentelemetry/edot-collector)
- [EDOT Collector Docker Quickstart (Self-Managed)](https://www.elastic.co/docs/solutions/observability/get-started/opentelemetry/quickstart/self-managed/docker)
- [EDOT Collector Docker Quickstart (Elastic Cloud)](https://www.elastic.co/docs/solutions/observability/get-started/opentelemetry/quickstart/ech/docker)
- [Elastic Distributions of OpenTelemetry GA Announcement](https://www.elastic.co/observability-labs/blog/elastic-distributions-opentelemetry-ga)
- [GitHub - Elastic OpenTelemetry](https://github.com/elastic/opentelemetry)

### Logging

- [pino-opentelemetry-transport](https://github.com/pinojs/pino-opentelemetry-transport) - Pino transport for OTLP log export
- [@opentelemetry/instrumentation-pino](https://www.npmjs.com/package/@opentelemetry/instrumentation-pino) - Auto-instrumentation for trace correlation

### General OpenTelemetry

- [Elastic Best Practices for Instrumenting OpenTelemetry](https://www.elastic.co/observability-labs/blog/best-practices-instrumenting-opentelemetry)
- [Use OpenTelemetry with Elastic APM](https://www.elastic.co/docs/solutions/observability/apm/opentelemetry)
- [OpenTelemetry Node.js Getting Started](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- [OpenTelemetry Instrumentation Libraries](https://opentelemetry.io/docs/languages/js/libraries/)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
