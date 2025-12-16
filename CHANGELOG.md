# Changelog

## 0.4.0

### Minor Changes

- ce00736: Add resilient handling of unknown event types - new device types are logged with warnings and indexed with basic field extraction instead of causing ingestion failures
- 2998edd: Add Jest testing infrastructure with 70% coverage thresholds and automated CI testing on Node.js 20.x and 22.x
- 05ca58d: Add E2E testing infrastructure with TestContainers for Elasticsearch and Kibana integration testing
- 7b8e1e3: Add exhaustive type system for smart home events with discriminated unions. Replaces loose `[key: string]: unknown` interface with precise types for all 5 event types (DeviceServiceData, device, room, message, client), enabling compile-time type safety and exhaustive checking. Includes dedicated transforms module for testable transformation logic and fixes for edge cases discovered during integration testing (optional fields, defensive ID generation).
- 21d5ee9: Add manual OpenTelemetry instrumentation with custom spans for tracking business logic performance across all CLI scripts

### Patch Changes

- 41a29d6: Add JSDoc documentation to all exported functions with automated ESLint enforcement for improved IDE intellisense and developer experience
- 5e9f961: Automatically clean up completed todo files during version releases
- 2f1ab24: Add environment variable validation with helpful error messages that guide users to fix configuration issues
- 9459ba2: Enable strict TypeScript ESLint rules for improved type safety and consistent import patterns
- 2f1ab24: Improve Elasticsearch configuration with lowercase index prefix and add architecture documentation
- 9737c28: Fix fatal crash on network timeouts and improve error message visibility across all scripts
- 34cf786: Fix ingest watch mode to only watch current day's file instead of all files
- 29324b7: Modernize test infrastructure with co-located test files and ES module imports for improved maintainability
- 75718c8: Refactor poll module for testability with comprehensive unit test coverage
- 28559af: Remove per-document transform spans to prevent OpenTelemetry queue overflow during bulk ingestion
- 3bbb93f: Refactor validation error handling with Result/Either pattern for improved composability and maintainability
- ccc3d7a: Upgrade TypeScript configuration to ES2022 with stricter type safety settings for improved code quality
- fa0d346: Improve TypeScript type safety for Kibana saved object handling with comprehensive interfaces aligned with official Kibana API

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
