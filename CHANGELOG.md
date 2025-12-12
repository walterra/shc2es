# Changelog

## 0.2.0

### Minor Changes

- 70377fa: Store config, certs, logs, and data in ~/.shc2es/ directory for global npm installs. Local .env is still supported for development.

## 0.1.1

### Patch Changes

- 2651efa: Fix global npm install by moving pino-pretty to dependencies (was devDependency but used at runtime)

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-12-11

### Added

- CLI with subcommands (`shc2es poll|ingest|registry|dashboard`)
- Long polling from Bosch Smart Home Controller II
- NDJSON event logging to `data/` directory
- Elasticsearch ingestion with device/room enrichment
- Kibana dashboard export/import
- Device registry fetching
- OpenTelemetry instrumentation (auto-enabled, `--no-otel` to disable)
- Pino structured logging
