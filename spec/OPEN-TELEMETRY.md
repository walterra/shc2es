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

## Alternative: Upstream OpenTelemetry

If you prefer standard OpenTelemetry without Elastic's distribution:

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

- [Elastic Best Practices for Instrumenting OpenTelemetry](https://www.elastic.co/observability-labs/blog/best-practices-instrumenting-opentelemetry)
- [Auto-instrumentation with OpenTelemetry for Node.js](https://www.elastic.co/observability-labs/blog/auto-instrument-nodejs-apps-opentelemetry)
- [EDOT Node.js Setup Documentation](https://www.elastic.co/docs/reference/opentelemetry/edot-sdks/node/setup)
- [Use OpenTelemetry with Elastic APM](https://www.elastic.co/docs/solutions/observability/apm/opentelemetry)
- [OpenTelemetry Node.js Getting Started](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- [Elastic OpenTelemetry Node Example Repository](https://github.com/elastic/elastic-otel-node-example)
- [EDOT Node.js Release Notes](https://www.elastic.co/docs/release-notes/edot/sdks/node)
- [OpenTelemetry Instrumentation Libraries](https://opentelemetry.io/docs/languages/js/libraries/)
