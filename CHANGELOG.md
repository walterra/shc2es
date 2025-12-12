# Changelog

## 0.3.1

### Patch Changes

- 76c02cb: Fix `ingest:watch` for chokidar v5 compatibility. Glob patterns are no longer supported in chokidar v4+, so the watcher now monitors the data directory with a filter function instead.

## 0.3.0

### Minor Changes

- d1ef54a: Add `--pattern` option to `ingest` command for selective file ingestion

  The `ingest` command now accepts a `--pattern` option to specify which files to import:

  ```bash
  # Import specific files using a glob pattern
  shc2es ingest --pattern "events-2025-12-*.ndjson"

  # Import a single file
  shc2es ingest --pattern "events-2025-12-10.ndjson"
  ```

  Patterns without `/` are relative to the data directory (`~/.shc2es/data/`). Absolute paths are also supported.

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
