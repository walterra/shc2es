# Changelog

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
