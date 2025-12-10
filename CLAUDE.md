# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical: Agent Restrictions

**NEVER run `yarn poll` directly.** The user runs this command manually. To debug issues:

1. Ask the user to run `yarn poll` and report what happens
2. Use the logging commands below to inspect logs
3. Fix code based on log analysis

## Project Overview

Node.js project for collecting Bosch Smart Home device data via long polling, storing it as NDJSON, and visualizing as time series.

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

### Environment Variables

Set in `.env` file:

```bash
BSH_HOST=192.168.x.x      # Controller IP address (required)
BSH_PASSWORD=xxxxx        # System password for initial pairing (required first run)
BSH_CLIENT_NAME=oss_xxx   # Client name (optional, has default)
BSH_CLIENT_ID=oss_xxx     # Client ID (optional, has default)
LOG_LEVEL=info            # Log level: debug, info, warn, error (optional)
```

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

## Planned Features

- **Visualization**: Time series charts/graphs
