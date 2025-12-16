# Project Description: shc2es

**Version:** 0.3.1  
**Purpose:** CLI tools to collect, store, and visualize Bosch Smart Home Controller II data with Elasticsearch and Kibana

## Overview

shc2es (Smart Home Controller to Elasticsearch) is a Node.js/TypeScript CLI application that:

1. **Collects** device data from Bosch Smart Home Controller II via long polling
2. **Stores** events as NDJSON files for durability and offline analysis
3. **Ingests** data into Elasticsearch for visualization in Kibana dashboards
4. **Monitors** application performance via OpenTelemetry/Elastic APM

## Architecture

### Core Components

```
src/
  cli.ts               # Entry point - command router
  config.ts            # Centralized configuration management
  poll.ts              # Long polling data collection
  ingest.ts            # Elasticsearch data ingestion
  fetch-registry.ts    # Device/room registry management
  export-dashboard.ts  # Kibana dashboard export/import
  logger.ts            # Pino-based structured logging
```

### Data Flow

```
Controller II (ZigBee devices)
    ↓ (long polling API)
poll.ts → NDJSON files (~/.shc2es/data/events-*.ndjson)
    ↓ (batch or watch mode)
ingest.ts → Elasticsearch (daily indices: smart-home-events-*)
    ↓ (dashboard import)
Kibana (time series visualization)
```

### Storage Locations

**User data** (`~/.shc2es/`):

- `data/events-YYYY-MM-DD.ndjson` - Daily event logs
- `data/device-registry.json` - Device/room metadata for enrichment
- `logs/poll-YYYY-MM-DD.log` - Application debug logs
- `certs/` - Client certificates for Controller II authentication
- `.env` - User configuration

**Bundled assets**:

- `dashboards/smart-home.ndjson` - Kibana dashboard template

## Key Features

### Data Collection (poll.ts)

- Long polling connection to Bosch Smart Home Controller II API
- Automatic certificate-based authentication (pairing required on first run)
- Daily log rotation (new NDJSON file each day)
- Structured JSON logging for debugging
- OpenTelemetry instrumentation for APM

### Data Ingestion (ingest.ts)

- Batch import: Process all or pattern-matched NDJSON files
- Watch mode: Real-time ingestion with file tailing and daily rotation handling
- Device registry enrichment: Adds human-readable device/room names
- Metric extraction: Normalizes sensor readings (temperature, humidity, etc.)
- Index template: Daily indices with proper field mappings
- Ingest pipeline: Document transformation and enrichment
- Kibana dashboard import: Auto-setup during `--setup`

### Configuration (config.ts)

- Environment-based configuration via `~/.shc2es/.env`
- Defaults for development (e.g., self-signed cert support)
- TLS verification control for dev/prod
- Support for multiple Elasticsearch auth methods (password, API key)

### Observability

- **Application logs**: Pino JSON logs for debugging (`~/.shc2es/logs/`)
  - **Standards**: ECS-compliant field naming (see `spec/LOGGING.md`)
  - **Format**: Structured JSON with human-readable messages
  - **Fields**: `error.message`, `device.id`, `file.path`, `url.full`, etc.
- **Event data**: NDJSON format for raw smart home events (`~/.shc2es/data/`)
- **APM tracing**: OpenTelemetry instrumentation for performance monitoring
- **Kibana dashboards**: Time series visualization of metrics

## CLI Commands

| Command                 | Purpose                         | Example                |
| ----------------------- | ------------------------------- | ---------------------- |
| `shc2es poll`           | Collect events from controller  | Start long polling     |
| `shc2es registry`       | Fetch device/room names         | Update enrichment data |
| `shc2es ingest`         | Import NDJSON to Elasticsearch  | Batch import           |
| `shc2es ingest --setup` | Create index + import dashboard | One-time setup         |
| `shc2es ingest --watch` | Real-time ingestion             | Live monitoring        |
| `shc2es dashboard`      | Export Kibana dashboard         | Version control        |

## Technical Stack

### Runtime

- **Node.js**: v20+ (ESM modules)
- **TypeScript**: Type-safe development
- **Package Manager**: Yarn 1.x (classic)

### Core Dependencies

- `bosch-smart-home-bridge`: Controller II API client
- `@elastic/elasticsearch`: Elasticsearch client
- `@elastic/opentelemetry-node`: Auto-instrumentation (EDOT)
- `pino`: Structured logging
- `chokidar`: File watching for live ingestion
- `glob`: File pattern matching

### Testing

- `jest`: Test framework with ts-jest
- `testcontainers`: Docker-based integration testing
- `@testcontainers/elasticsearch`: Official Elasticsearch container
- `express`: Mock HTTP server for E2E tests
- Coverage thresholds: 70% statements/functions/lines, 60% branches
- **Unit tests:** 218 tests for core modules (config, logger, validation, transforms, types)
- **E2E tests:** 18 tests with real Elasticsearch/Kibana containers validating complete data flows

## Configuration

### Required (for data collection)

```bash
BSH_HOST=192.168.x.x      # Controller IP
BSH_PASSWORD=xxxxx        # System password
```

### Optional (Elasticsearch)

```bash
ES_NODE=https://localhost:9200
ES_PASSWORD=changeme
ES_INDEX_PREFIX=smart-home-events   # Default index name prefix
KIBANA_NODE=https://localhost:5601  # For dashboard import
```

### Optional (OpenTelemetry)

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://apm.example.com
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer TOKEN
```

### Development Mode

```bash
ES_TLS_VERIFY=false       # Disable cert verification (dev only)
OTEL_TLS_VERIFY=false     # Disable cert verification (dev only)
```

## Security

- **Local API only**: No cloud dependencies for data collection
- **Certificate auth**: Automatic client cert generation for Controller II
- **TLS by default**: HTTPS for Elasticsearch/Kibana connections
- **Environment isolation**: User data in `~/.shc2es/`, not in project directory
- **No credentials in repo**: All secrets in `.env` file

## Development Workflow

1. Install dependencies: `yarn install`
2. Build TypeScript: `yarn build`
3. Run tests: `yarn test` (with coverage)
4. Lint/format: `yarn lint`, `yarn format`
5. Version management: Changesets for semver releases

## Project Maturity

- **Status**: Alpha/Beta (v0.3.1)
- **Primary use case**: Educational and personal home automation monitoring
- **License**: MIT
- **Testing coverage**: 
  - 218 unit tests (70%+ coverage on core modules)
  - 18 E2E tests (complete data pipeline validation with TestContainers)
- **Documentation**: 
  - README, spec files for architecture/APIs/logging standards (spec/LOGGING.md)
  - E2E testing guide (spec/E2E-TESTING.md)

## Known Limitations

- Dashboard import requires manual Kibana setup (no auto-discovery)
- Watch mode file rotation needs testing for midnight edge case
- Limited error recovery for transient Elasticsearch failures
- No automatic data retention/cleanup (manual ILM setup required)

## Future Considerations

- Elasticsearch data streams for automatic rollover
- More robust error handling and retry logic
- E2E tests with real Elasticsearch (testcontainers)
- Multi-deployment support documentation (dev/prod on same Kibana)
