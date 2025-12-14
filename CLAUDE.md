# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical: Agent Restrictions

**NEVER run `yarn poll` directly.** The user runs this command manually. To debug issues:

1. Ask the user to run `yarn poll` and report what happens
2. Use the logging commands below to inspect logs
3. Fix code based on log analysis

**Note:** First-time pairing requires physical button press on Controller II - agent cannot complete this step.

## Package Manager

**ALWAYS use `yarn` for package management**, never `npm`. This project uses Yarn 1.x (classic).

```bash
# ✅ Correct
yarn add <package>
yarn add --dev <package>
yarn install

# ❌ Incorrect
npm install <package>
npm install --save-dev <package>
```

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

### Core Commands

```bash
yarn install          # Install dependencies
yarn build            # Compile TypeScript to dist/
yarn test             # Run all tests
yarn test:coverage    # Run tests with coverage report
yarn lint             # Check code for issues
yarn format           # Format code with Prettier
```

### Application Commands

```bash
yarn poll             # Start long polling CLI (USER RUNS THIS, NOT AGENT)
yarn ingest           # Batch import all NDJSON files to Elasticsearch
yarn ingest --pattern "events-2025-12-*.ndjson"  # Import specific files
yarn registry         # Fetch device registry from controller
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

### Testing Commands (Agent should use these)

```bash
yarn test             # Run all tests
yarn test:watch       # Run tests in watch mode (for TDD)
yarn test:coverage    # Generate coverage report
yarn test:unit        # Run only unit tests
yarn test:integration # Run only integration tests
yarn test:ci          # Run tests in CI mode (used by GitHub Actions)
```

### Debugging Workflow

1. User reports an issue with `yarn poll`
2. Run `yarn logs:raw` to get structured JSON logs
3. Parse logs to identify errors (look for `"level":50` for errors, `"level":60` for fatal)
4. Fix the code in `src/poll.ts` or `src/logger.ts`
5. Ask user to restart `yarn poll`

### Pino Log Levels

| Level | Value | Use               |
| ----- | ----- | ----------------- |
| fatal | 60    | App crash         |
| error | 50    | Errors            |
| warn  | 40    | Warnings          |
| info  | 30    | Normal operation  |
| debug | 20    | Verbose debugging |

### Environment Variables

Set in `~/.shc2es/.env` file (or local `.env` for development):

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
  config.ts            # Centralized config - paths, env loading
  poll.ts              # Main CLI script - long polling logic
  logger.ts            # Pino logger setup (app + data loggers)
  ingest.ts            # Elasticsearch data ingestion
  fetch-registry.ts    # Device registry fetching
  export-dashboard.ts  # Kibana dashboard export/import
  cli.ts               # CLI command router

tests/
  unit/                # Unit tests for individual modules
  integration/         # Integration tests
  mocks/               # Mock implementations
  fixtures/            # Test data
  utils/               # Test helpers
  setup.ts             # Global test setup

~/.shc2es/             # User config directory
  .env                 # Configuration file
  certs/
    client-cert.pem    # Generated client certificate
    client-key.pem     # Generated private key
  logs/
    poll-YYYY-MM-DD.log  # App logs (JSON) - for debugging
  data/
    events-YYYY-MM-DD.ndjson  # Smart home events - collected data
```

### Logging Architecture

Two separate log streams:

| Logger       | File                             | Format | Purpose                |
| ------------ | -------------------------------- | ------ | ---------------------- |
| `appLogger`  | `~/.shc2es/logs/poll-*.log`      | JSON   | Debug the polling tool |
| `dataLogger` | `~/.shc2es/data/events-*.ndjson` | NDJSON | Smart home event data  |

### Dependencies

#### Production Dependencies

- `bosch-smart-home-bridge` - Controller API communication
- `pino` - Structured JSON logging
- `dotenv` - Environment variable loading
- `@elastic/opentelemetry-node` - Auto-instrumentation for Elastic APM
- `@elastic/elasticsearch` - Elasticsearch client for data ingestion
- `glob` - File pattern matching
- `chokidar` - File watching for live ingestion

#### Development Dependencies

- `jest` - Testing framework
- `ts-jest` - TypeScript support for Jest
- `@types/jest` - TypeScript types for Jest
- `typescript` - TypeScript compiler
- `eslint` - Code linting
- `prettier` - Code formatting
- `@changesets/cli` - Version management

## Changesets

**Do NOT use `yarn changeset`** - it's interactive. Create files directly:

```markdown
# .changeset/<descriptive-name>.md

---

"shc2es": patch|minor|major

---

Concise single-line description for CHANGELOG.md (not implementation details)
```

**Guidelines for changeset messages:**
- ✅ **Good**: "Add Jest testing infrastructure with 70% coverage thresholds and automated CI testing"
- ❌ **Bad**: Listing every file changed, configuration option, or implementation detail
- Focus on **user-facing value** or **high-level feature addition**
- Keep it **one line** when possible (two max)
- Think: "What would a user want to see in release notes?"

## Testing

The project has comprehensive test coverage using Jest. See `spec/TESTING-INFRASTRUCTURE.md` for details.

### Test Guidelines

1. **Run tests before committing**: `yarn test`
2. **Maintain coverage thresholds**: 70% minimum for all metrics
3. **Write tests for new features**: Add to `tests/unit/` or `tests/integration/`
4. **Use test utilities**: Import from `tests/utils/test-helpers.ts`
5. **Mock external services**: Use mocks from `tests/mocks/`
6. **Isolate tests**: Use `createTempDir()` for file operations

## Documentation Maintenance

Keep `README.md` up to date when making changes. The README is end-user focused (installation, usage, configuration) while CLAUDE.md is agent-focused (debugging, restrictions, architecture).

### Key Documentation Files

- `README.md` - User-facing documentation
- `CLAUDE.md` - Agent guidance (this file)
- `spec/TESTING-INFRASTRUCTURE.md` - Testing details
- `spec/OPEN-TELEMETRY.md` - Observability setup
- `spec/REVIEW-2025-12-14.md` - Project assessment and roadmap
- `tests/README.md` - Developer test guide
