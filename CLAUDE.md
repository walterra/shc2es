# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical: Agent Restrictions

**NEVER run `yarn poll` directly.** The user runs this command manually. To debug issues:

1. Ask the user to run `yarn poll` and report what happens
2. Use the logging commands below to inspect logs
3. Fix code based on log analysis

**Note:** First-time pairing requires physical button press on Controller II - agent cannot complete this step.

## Project Overview

**shc2es** (Smart Home Controller to Elasticsearch) - Collects device data from Bosch Smart Home Controller II via long polling, stores as NDJSON, and ingests into Elasticsearch for Kibana dashboards.

### Naming & Trademarks

The project name `shc2es` uses abbreviations to avoid trademark issues:
- **SHC** = Smart Home Controller (from official Bosch API docs naming: `bosch-shc-api-docs`)
- **ES** = Elasticsearch (common community abbreviation)

**Trademark restrictions** (do not use these in package/project names):
- "Elasticsearch", "Elastic", "Kibana" - [Elastic Trademark Policy](https://www.elastic.co/legal/trademarks)
- "Bosch" with claims suggesting involvement - [Bosch SHC API License](https://github.com/BoschSmartHome/bosch-shc-api-docs)

**Allowed**: Use full trademark names in descriptions, README, and GitHub topics for discoverability.

## Hardware

Based on the [Bosch Smart Home Controller II](https://www.bosch-smarthome.com/at/de/produkte/steuerung-und-zentrale/smart-home-controller/) - the central hub that connects and controls Bosch Smart Home devices.

### Key Capabilities for Development

- **Local API**: The controller exposes a local API for private/non-commercial use (documentation available on GitHub)
- **Protocol**: ZigBee 3.0 (2.4 GHz), Matter-ready as bridge
- **Network**: Ethernet RJ45 (10/100 Mbit/s) - controller accessible on local network
- **Security**: Data encrypted locally on device; works offline, optional cloud for remote access
- **Device Support**: 2nd-gen Bosch Smart Home devices; 1st-gen via 868 MHz Funk-Stick accessory

## Commands

```bash
yarn install          # Install dependencies
yarn poll             # Start long polling CLI (USER RUNS THIS, NOT AGENT)
yarn tsc --noEmit     # Type check without emitting
```

### Debugging Commands (Agent should use these)

```bash
# App logs (debugging yarn poll)
yarn logs             # View today's logs (pretty formatted)
yarn logs:tail        # Follow logs in real-time
yarn logs:errors      # Show only WARN/ERROR/FATAL
yarn logs:raw         # Raw JSON - use this for parsing/analysis
yarn logs:raw:tail    # Follow raw JSON logs

# Data logs (smart home events)
yarn data             # Show last 20 events
yarn data:tail        # Follow events in real-time
```

### Debugging Workflow

1. User reports an issue with `yarn poll`
2. Run `yarn logs:raw` to get structured JSON logs
3. Parse logs to identify errors (look for `"level":50` for errors, `"level":60` for fatal)
4. Fix the code in `src/poll.ts` or `src/logger.ts`
5. Ask user to restart `yarn poll`

### Pino Log Levels

| Level | Value | Use |
|-------|-------|-----|
| fatal | 60 | App crash |
| error | 50 | Errors |
| warn | 40 | Warnings |
| info | 30 | Normal operation |
| debug | 20 | Verbose debugging |

### Environment Variables

Set in `.env` file:

```bash
BSH_HOST=192.168.x.x      # Controller IP address (required)
BSH_PASSWORD=xxxxx        # System password for initial pairing (required first run)
BSH_CLIENT_NAME=oss_xxx   # Client name (optional, has default)
BSH_CLIENT_ID=oss_xxx     # Client ID (optional, has default)
LOG_LEVEL=info            # Log level: debug, info, warn, error (optional)

# OpenTelemetry (optional)
OTEL_SERVICE_NAME=shc2es
OTEL_RESOURCE_ATTRIBUTES=service.version=1.0.0,deployment.environment=production

# EDOT Collector (for local collector setup)
ES_NODE=https://localhost:9200
ELASTIC_API_KEY=your_api_key_here
```

### OpenTelemetry Instrumentation

All scripts include automatic OpenTelemetry instrumentation via `@elastic/opentelemetry-node`. Telemetry is sent to the local EDOT Collector (localhost:4318) by default.

**EDOT Collector commands:**
- `yarn otel:collector:start` - Start the collector (Docker)
- `yarn otel:collector:stop` - Stop the collector
- `yarn otel:collector:logs` - View collector logs

To run without instrumentation, use `yarn poll:no-otel`.

See `spec/OPEN-TELEMETRY.md` for detailed configuration, APM UI requirements, and best practices.

## Architecture

```
src/
  poll.ts              # Main CLI script - long polling logic
  logger.ts            # Pino logger setup (app + data loggers)
logs/
  poll-YYYY-MM-DD.log  # App logs (JSON) - for debugging
data/
  events-YYYY-MM-DD.ndjson  # Smart home events - collected data
certs/
  client-cert.pem      # Generated client certificate
  client-key.pem       # Generated private key
```

### Logging Architecture

Two separate log streams:

| Logger | File | Format | Purpose |
|--------|------|--------|---------|
| `appLogger` | `logs/poll-*.log` | JSON | Debug the polling tool |
| `dataLogger` | `data/events-*.ndjson` | NDJSON | Smart home event data |

### Dependencies

- `bosch-smart-home-bridge` - Controller API communication
- `pino` - Structured JSON logging
- `dotenv` - Environment variable loading
- `@elastic/opentelemetry-node` - Auto-instrumentation for Elastic APM
- `@elastic/elasticsearch` - Elasticsearch client for data ingestion

## Planned Features

- **Visualization**: Time series charts/graphs

## Documentation Maintenance

Keep `README.md` up to date when making changes. The README is end-user focused (installation, usage, configuration) while CLAUDE.md is agent-focused (debugging, restrictions, architecture).
