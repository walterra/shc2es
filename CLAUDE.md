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

## Project Status

This is a new project. The codebase structure and build commands will be documented here as development progresses.

## Planned Architecture

Based on the project description:
- **Data Collection**: Long polling from Bosch Smart Home API
- **Storage Format**: NDJSON (newline-delimited JSON) files
- **Visualization**: Time series charts/graphs
