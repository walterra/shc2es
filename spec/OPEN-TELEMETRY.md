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
