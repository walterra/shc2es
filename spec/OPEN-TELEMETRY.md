# OpenTelemetry to Elasticsearch Best Practices (2025)

This document covers best practices for instrumenting Node.js processes with OpenTelemetry and sending telemetry data to Elasticsearch/Elastic Observability.

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
export OTEL_SERVICE_NAME="bosch-smart-home-poller"
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

OpenTelemetry logging is still maturing. Recommended approach:

1. **Use Pino** (already in this project) for structured JSON logging
2. **Correlate logs with traces** using trace context
3. **Ship logs separately** via Elastic Agent or Filebeat

```typescript
import pino from "pino";
import { trace, context } from "@opentelemetry/api";

const logger = pino({
  mixin() {
    const span = trace.getSpan(context.active());
    if (span) {
      const spanContext = span.spanContext();
      return {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
      };
    }
    return {};
  },
});
```

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

#### Docker Setup

**1. Create `otel-collector-config.yml`:**

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:

exporters:
  elasticsearch:
    endpoints: ["${ELASTIC_ENDPOINT}"]
    api_key: ${ELASTIC_API_KEY}

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [elasticsearch]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [elasticsearch]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [elasticsearch]
```

**2. Create `.env` for the collector:**

```bash
HOST_FILESYSTEM=/
DOCKER_SOCK=/var/run/docker.sock
ELASTIC_AGENT_OTEL=true
COLLECTOR_CONTRIB_IMAGE=elastic/elastic-agent:9.2.2
ELASTIC_API_KEY=<your-api-key>
ELASTIC_ENDPOINT=https://localhost:9200
OTEL_COLLECTOR_CONFIG=./otel-collector-config.yml
```

**3. Create `docker-compose.yml`:**

```yaml
services:
  otel-collector:
    image: ${COLLECTOR_CONTRIB_IMAGE}
    container_name: otel-collector
    deploy:
      resources:
        limits:
          memory: 1.5G
    restart: unless-stopped
    user: "0:0"
    network_mode: host
    environment:
      - ELASTIC_AGENT_OTEL=${ELASTIC_AGENT_OTEL}
      - ELASTIC_API_KEY=${ELASTIC_API_KEY}
      - ELASTIC_ENDPOINT=${ELASTIC_ENDPOINT}
    volumes:
      - ${HOST_FILESYSTEM}:/hostfs:ro
      - ${DOCKER_SOCK}:/var/run/docker.sock:ro
      - ${OTEL_COLLECTOR_CONFIG}:/etc/otelcol-contrib/config.yaml:ro
```

**4. Run:**

```bash
docker compose up -d
```

**5. Configure your app (no endpoint needed - defaults to localhost:4318):**

```bash
OTEL_SERVICE_NAME=bosch-smart-home
yarn poll
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

### General OpenTelemetry

- [Elastic Best Practices for Instrumenting OpenTelemetry](https://www.elastic.co/observability-labs/blog/best-practices-instrumenting-opentelemetry)
- [Use OpenTelemetry with Elastic APM](https://www.elastic.co/docs/solutions/observability/apm/opentelemetry)
- [OpenTelemetry Node.js Getting Started](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- [OpenTelemetry Instrumentation Libraries](https://opentelemetry.io/docs/languages/js/libraries/)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
