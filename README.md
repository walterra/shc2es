# Bosch Smart Home Data Collector

Node.js project to collect device data from Bosch Smart Home Controller II via long polling. Data is stored as NDJSON files and can be ingested into Elasticsearch for time series visualization.

## Prerequisites

- Node.js (v18+)
- Yarn
- [Bosch Smart Home Controller II](https://www.bosch-smarthome.com/at/de/produkte/steuerung-und-zentrale/smart-home-controller/) on your local network
- System password (set in Bosch Smart Home app under Settings → System → Smart Home Controller)
- Elasticsearch (optional, for data visualization)

## Installation

```bash
git clone <repo-url>
cd bosch-smart-home
yarn install
```

## Configuration

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# Bosch Smart Home Controller (required)
BSH_HOST=192.168.x.x      # Your controller's IP address
BSH_PASSWORD=xxxxx        # System password from Bosch app
LOG_LEVEL=info            # Optional: debug, info, warn, error

# Elasticsearch (optional, for ingest)
ES_NODE=https://localhost:9200
ES_USER=elastic
ES_PASSWORD=<password>
ES_INDEX_PREFIX=smart-home-events   # Optional, default: smart-home-events
```

**Finding your controller's IP:** Check the Bosch Smart Home app (Settings → System → Smart Home Controller) or your router's DHCP client list.

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

### Elasticsearch Ingestion

Ingest collected data into Elasticsearch for visualization in Kibana:

```bash
# 1. Fetch device/room names for enrichment (run once, or when devices change)
yarn registry

# 2. Create ES pipeline and index template (run once)
yarn ingest:setup

# 3. Batch import existing NDJSON files
yarn ingest

# 4. Or: watch for new events and ingest in real-time
yarn ingest:watch
```

Data is indexed into daily indices: `smart-home-events-YYYY-MM-DD`

Each document includes:
- `@timestamp` - Event time
- `device.name` / `device.type` - Human-readable device info
- `room.name` - Room assignment
- `metric.name` / `metric.value` - Normalized sensor readings (temperature, humidity, etc.)

## Output Files

| Directory | Contents |
|-----------|----------|
| `data/` | Smart home events (`events-YYYY-MM-DD.ndjson`), device registry |
| `logs/` | Application logs for debugging (`poll-YYYY-MM-DD.log`) |
| `certs/` | Generated client certificates |

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
