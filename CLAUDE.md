# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
yarn poll             # Start long polling CLI
```

### Environment Variables

```bash
BSH_HOST=192.168.x.x      # Controller IP address (required)
BSH_PASSWORD=xxxxx        # System password for initial pairing (required first run)
BSH_CLIENT_NAME=oss_xxx   # Client name (optional, has default)
BSH_CLIENT_ID=oss_xxx     # Client ID (optional, has default)
```

### First Run (Pairing)

```bash
BSH_PASSWORD=your_password BSH_HOST=192.168.x.x yarn poll
# Press pairing button on Controller II when prompted
```

## Architecture

- **src/poll.ts** - CLI script for long polling device events
- **certs/** - Generated client certificates (gitignored)
- Uses `bosch-smart-home-bridge` library for controller communication

## Planned Features

- **Storage**: NDJSON file output for collected events
- **Visualization**: Time series charts/graphs
