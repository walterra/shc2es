# shc2es

[![npm version](https://img.shields.io/npm/v/shc2es)](https://www.npmjs.com/package/shc2es)
[![CI](https://github.com/walterra/shc2es/actions/workflows/ci.yml/badge.svg)](https://github.com/walterra/shc2es/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/walterra/shc2es/badge)](https://scorecard.dev/viewer/?uri=github.com/walterra/shc2es)

CLI tools to collect, store, and visualize Bosch Smart Home Controller II data via long polling. Data gets collected as NDJSON and can be passed on to Elasticsearch for Kibana dashboards and time series visualization.

![Kibana Dashboard](docs/images/dashboard.png)

## Quick Start

Get up and running in 5 minutes:

> ⚠️ **For educational and development purposes only.** These instructions use `start-local` with self-signed certificates and disabled TLS verification. Do not use this configuration in production. For production deployments, use properly signed certificates and remove `ES_TLS_VERIFY=false` / `OTEL_TLS_VERIFY=false`.

```bash
# 1. Install
npm install -g shc2es

# 2. Configure (create ~/.shc2es/.env)
mkdir -p ~/.shc2es
cat > ~/.shc2es/.env << 'EOF'
# Your controller's IP (find in Bosch app or router)
BSH_HOST=192.168.x.x

# System password from Bosch Smart Home app
BSH_PASSWORD=your_password
EOF

# 3. Start collecting data

# On first run press the button on Bosch Smart Home Controller II!
shc2es poll

# 4. Set up Elasticsearch/Kibana

# Use start-local to set up ES/Kibana dev environments
curl -fsSL https://elastic.co/start-local | sh

# Add ES config to ~/.shc2es/.env (use info from start-local output)
cat >> ~/.shc2es/.env << 'EOF'
ES_NODE=http://localhost:9200
ES_PASSWORD=your_es_password
KIBANA_NODE=http://localhost:5601
COLLECTOR_ES_NODE=http://host.docker.internal:9200
ELASTIC_API_KEY=your_es_api_key

# For local development, don't set to false in production!
ES_TLS_VERIFY=false
OTEL_TLS_VERIFY=false
EOF

# Set up and ingest
shc2es registry          # Fetch device/room names
shc2es ingest --setup    # Create index + import dashboard
shc2es ingest --watch    # Real-time ingestion
```

This will read the collected NDJSON files and add them to Elasticsearch.

Open Kibana → Dashboards → "Smart Home" to see your data.

---

## Prerequisites

- Node.js (v20+)
- [Bosch Smart Home Controller II](https://www.bosch-smarthome.com/at/de/produkte/steuerung-und-zentrale/smart-home-controller/) on your local network
- System password (set in Bosch Smart Home app under Settings → System → Smart Home Controller)
- Elasticsearch (optional, for data visualization)
- Elastic APM (optional, for application performance monitoring)
- Yarn (only if installing from source)

## Installation

### From npm (recommended)

```bash
npm install -g shc2es
```

### From source (for development)

```bash
git clone https://github.com/walterra/shc2es.git
cd shc2es
yarn install
yarn build
```

When running from source, use `yarn poll`, `yarn ingest`, etc. instead of `shc2es`.

## Configuration

Configuration is stored in `~/.shc2es/.env`. Create the directory and file:

```bash
mkdir -p ~/.shc2es
```

Edit `~/.shc2es/.env` with your settings:

```bash
# Bosch Smart Home Controller (required for yarn poll)
BSH_HOST=192.168.x.x      # Your controller's IP address
BSH_PASSWORD=xxxxx        # System password from Bosch app
LOG_LEVEL=info            # Optional: debug, info, warn, error

# Elasticsearch (required for yarn ingest commands)
ES_NODE=https://localhost:9200
ES_USER=elastic           # Optional, defaults to "elastic"
ES_PASSWORD=<password>
ES_INDEX_PREFIX=smart-home-events   # Optional, default: smart-home-events
                                    # Prefix for indices, pipeline, template, and dashboard IDs
                                    # Useful for multi-deployment scenarios (dev/prod)

# Kibana (optional, for dashboard import during yarn ingest:setup)
KIBANA_NODE=https://localhost:5601

# OpenTelemetry / Elastic APM (optional)
# OTEL_SERVICE_NAME is set automatically per-command (e.g., shc2es-poll, shc2es-ingest)
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-deployment.apm.region.cloud.es.io
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer YOUR_APM_SECRET_TOKEN
OTEL_RESOURCE_ATTRIBUTES=service.version=1.0.0,deployment.environment=production

# EDOT Collector (alternative to direct OTLP endpoint)
# Used by yarn otel:collector commands - requires ES_NODE above
ELASTIC_API_KEY=your_api_key_here   # Generate in Kibana: Stack Management → API Keys
```

### TLS Configuration

By default, TLS certificate verification is **enabled**. For development with self-signed certificates (e.g., `start-local`), you can disable verification:

```bash
# Elasticsearch/Kibana connections (ingest, dashboard export)
ES_TLS_VERIFY=false              # Disable cert verification
ES_CA_CERT=/path/to/ca.pem       # Or: provide custom CA certificate

# OTEL Collector → Elasticsearch
OTEL_TLS_VERIFY=false            # Disable cert verification
OTEL_CA_FILE=/path/to/ca.pem     # Or: provide custom CA certificate
```

⚠️ **Security warning:** Only disable TLS verification in development environments. For production, use properly signed certificates or provide a custom CA.

**Finding your controller's IP:** Check the Bosch Smart Home app (Settings → System → Smart Home Controller) or your router's DHCP client list.

### Multi-Deployment Scenarios

Use `ES_INDEX_PREFIX` to run multiple environments against the same Elasticsearch cluster without conflicts:

```bash
# Development environment (~/.shc2es/.env)
ES_INDEX_PREFIX=dev-smarthome

# Production environment (~/.shc2es/.env)
ES_INDEX_PREFIX=prod-smarthome
```

Each prefix creates isolated indices (`dev-smarthome-2025-12-14`, `prod-smarthome-2025-12-14`), pipelines, templates, and Kibana dashboards. Dashboards are automatically prefixed during `yarn ingest:setup` to match your index prefix.

## Usage

### First Run (Pairing)

On first run, you need to pair with the controller:

1. Run `yarn poll`
2. When prompted, press the pairing button on your Controller II
3. Run `yarn poll` again

The client certificate will be generated and saved automatically.

### Collecting Data

```bash
yarn poll             # Start collecting events (Ctrl+C to stop)
```

### Viewing Logs

```bash
yarn logs             # View today's app logs (formatted)
yarn logs:errors      # View only errors/warnings
yarn data             # View last 20 smart home events
yarn data:tail        # Follow events in real-time
```

### Local Development Stack

Quickly spin up Elasticsearch and Kibana locally for development using Elastic's [start-local](https://github.com/elastic/start-local) script:

```bash
yarn es-dev:start     # Download and start Elasticsearch + Kibana (Docker)
yarn es-dev:stop      # Stop containers (preserves data)
yarn es-dev:down      # Stop and remove containers
yarn es-dev:logs      # Follow container logs
```

After starting, you'll have:

- Elasticsearch at http://localhost:9200
- Kibana at http://localhost:5601
- Credentials stored in `elastic-start-local/.env`

⚠️ **Development only** - Do not use for production.

### Elasticsearch Ingestion

Ingest collected data into Elasticsearch for visualization in Kibana:

```bash
# 1. Fetch device/room names for enrichment (run once, or when devices change)
yarn registry

# 2. Create ES pipeline and index template (run once)
# Also imports Kibana dashboard if KIBANA_NODE is configured
yarn ingest:setup

# 3. Batch import existing NDJSON files
yarn ingest

# 3b. Or: import specific files using a glob pattern
yarn ingest --pattern "events-2025-12-*.ndjson"

# 4. Or: watch for new events and ingest in real-time
yarn ingest:watch
```

Data is indexed into daily indices: `smart-home-events-YYYY-MM-DD`

### Dashboard Management

Export dashboards from Kibana for version control:

```bash
yarn dashboard:export --list          # List available dashboards
yarn dashboard:export "Smart Home"    # Export a dashboard by name
```

Exported dashboards are saved to `dashboards/` and automatically imported during `yarn ingest:setup` if `KIBANA_NODE` is configured.

### OpenTelemetry / APM

All scripts include automatic instrumentation via the [Elastic Distribution of OpenTelemetry Node.js](https://www.elastic.co/docs/reference/opentelemetry/edot-sdks/node/setup) (EDOT). When configured, telemetry data (traces, metrics) is sent to Elastic APM.

**To enable APM**, add these to your `.env`:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-deployment.apm.region.cloud.es.io
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer YOUR_APM_SECRET_TOKEN
```

The service name is set automatically per-command (e.g., `shc2es-poll`, `shc2es-ingest`).

**To disable instrumentation**, use:

```bash
yarn poll:no-otel     # Run without OpenTelemetry
```

Or set `OTEL_SDK_DISABLED=true` in your environment.

See `spec/OPEN-TELEMETRY.md` for detailed configuration and best practices.

Each document includes:

- `@timestamp` - Event time
- `device.name` / `device.type` - Human-readable device info
- `room.name` - Room assignment
- `metric.name` / `metric.value` - Normalized sensor readings (temperature, humidity, etc.)

## Output Files

All user data is stored in `~/.shc2es/`:

| Directory           | Contents                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `~/.shc2es/data/`   | Smart home events (`events-YYYY-MM-DD.ndjson`), device registry (`device-registry.json`) |
| `~/.shc2es/logs/`   | Application logs for debugging (`poll-YYYY-MM-DD.log`)                                   |
| `~/.shc2es/certs/`  | Generated client certificates (`client-cert.pem`, `client-key.pem`)                      |
| `~/.shc2es/.env`    | Configuration file                                                                       |

Bundled with package:

| Directory     | Contents                                          |
| ------------- | ------------------------------------------------- |
| `dashboards/` | Exported Kibana dashboards (`smart-home.ndjson`)  |

## Hardware

### Controller II Features

- **Communication**: ZigBee 3.0 (2.4 GHz), Matter-ready as bridge device
- **Connectivity**: RJ45 Ethernet (10/100 Mbit/s)
- **Security**: Local encrypted data storage, secure remote access
- **Local API**: Supports private/non-commercial developer solutions ([API docs](https://github.com/BoschSmartHome/bosch-shc-api-docs))
- **Integrations**: Amazon Alexa, Apple HomeKit, Google Assistant
- **Supported Devices**: 2nd-gen Bosch Smart Home products; 1st-gen devices via optional 868 MHz Funk-Stick

## License

MIT
