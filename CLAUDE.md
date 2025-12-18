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
  cli.ts               # CLI command router
  config.ts            # Centralized config - paths, env loading
  config.test.ts       # Unit tests (co-located with source)
  logger.ts            # Pino logger setup (app + data loggers)
  logger.test.ts
  instrumentation.ts   # OpenTelemetry setup and utilities
  instrumentation.test.ts
  validation.ts        # Data validation and schema enforcement
  validation.test.ts
  transforms.ts        # Data transformation utilities
  transforms.test.ts
  poll.ts              # Long polling CLI - collects smart home events
  poll.test.ts
  fetch-registry.ts    # Device registry fetching
  export-dashboard.ts  # Kibana dashboard export/import
  export-dashboard.test.ts

  ingest/              # Elasticsearch ingestion modules
    main.ts            # Main ingestion entry point
    config.ts          # Ingestion-specific configuration
    bulk-import.ts     # Batch NDJSON file import
    watch.ts           # Live file watching for continuous ingestion
    transform.ts       # Event transformation for Elasticsearch
    setup.ts           # Elasticsearch index/template setup
    dashboard.ts       # Dashboard import automation
    registry.ts        # Device registry ingestion
    utils.ts           # Shared ingestion utilities

  types/               # TypeScript type definitions
    config.ts          # Configuration interfaces (centralized)
    errors.ts          # Custom error classes
    errors.test.ts
    smart-home-events.ts  # Smart home event types
    smart-home-events.test.ts
    kibana-saved-objects.ts  # Kibana object types
    kibana-saved-objects.test.ts

tests/
  e2e/                 # End-to-end integration tests
  mocks/               # Mock implementations (bridge, controller server)
  fixtures/            # Test data files
  utils/               # Test helpers (containers, test-helpers)
  setup.ts             # Jest test setup
  setup.e2e.ts         # E2E test setup
  global-setup.e2e.ts  # E2E global setup (TestContainers)
  global-teardown.e2e.ts  # E2E global teardown

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

### Configuration Flow

Consistent dependency injection pattern for testability:

1. **cli.ts** - Entry point loads and validates all configuration
   - Calls `loadEnv()` to read from `.env` files
   - Validates configuration based on command (`validatePollConfig()`, `validateIngestConfig()`, etc.)
   - Passes validated config to command's `main()` function
2. **Scripts** - Receive configuration via dependency injection
   - `poll.ts`: `main(exit, config, signal?, bridgeFactory?)`
   - `ingest/main.ts`: `main(exit, context)` where `context.config` is required
   - `fetch-registry.ts`: `main(exit, context)` where `context.config` is required
   - `export-dashboard.ts`: `main(exit, context)` where `context.config` is required
3. **Tests** - Inject configuration the same way production code does
   - Unit tests pass minimal config objects
   - E2E tests pass full config with container URLs

**Key principle:** Scripts never read from `process.env` directly. All configuration flows through `cli.ts` → `main()` → script logic.

**Configuration types:** Centralized in `src/types/config.ts`:

- `PollConfig` - Controller connection settings
- `IngestConfig` - Elasticsearch and Kibana settings
- `RegistryConfig` - Controller connection for registry fetch
- `DashboardConfig` - Kibana settings for dashboard export

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

The project has test coverage using Jest for core modules.

### Test Guidelines

1. **Run tests before committing**: `yarn test`
2. **Maintain coverage thresholds**:
   - 70% minimum for statements, functions, and lines
   - 60% minimum for branches
3. **Write tests for new features**: Add to `tests/unit/` or `tests/integration/`
4. **Use test utilities**: Import from `tests/utils/test-helpers.ts`
5. **Mock external services**: Use mocks from `tests/mocks/`
6. **Isolate tests**: Use `createTempDir()` for file operations

### Coverage Scope

Currently testing core modules (`config.ts`, `logger.ts`). CLI scripts (`poll.ts`, `ingest.ts`, `fetch-registry.ts`, `export-dashboard.ts`) are excluded from coverage as they are primarily orchestration code best tested via integration/E2E tests.

## Documentation Maintenance

Keep `README.md` up to date when making changes. The README is end-user focused (installation, usage, configuration) while CLAUDE.md is agent-focused (debugging, restrictions, architecture).

## Technical Writing Style

Technical writer for documentation and JSDoc comments, direct factual statements only, no filler words (very/really/quite/just/simply/basically/actually/literally/comprehensive), no hedging (probably/maybe/might/could/should), no obvious phrases (please note/it's important to/keep in mind), start with present tense verbs (fetches/calculates/returns), state what not how, one line when possible, omit self-evident type information, active voice only, remove redundant phrases (in order to→to, completely finished→finished), every adjective must add information, sentences under 20 words, if removing a word preserves meaning remove it, strip all decoration keep only information.

## Coding style

Production-grade TypeScript module with strict type safety, zero implicit any, comprehensive
JSDoc comments with @param and @return tags, functional programming patterns with immutable
data structures, error handling using Result/Either pattern or custom error classes extending
Error, dependency injection for testability, single responsibility principle with functions
under 50 lines and files under 300 lines, using Pino structured logging with correlation IDs,
async/await with proper AbortController signal handling, exhaustive union type checking with
never fallbacks, Jest unit tests with 70% branch coverage using arrange-act-assert pattern,
integration tests with TestContainers for external dependencies, property-based testing with
fast-check for edge cases, ESLint strict ruleset with no-explicit-any and no-unsafe-\* rules
enabled plus complexity guards (max-lines:300, max-lines-per-function:50, complexity:10,
max-depth:3, max-params:4, max-nested-callbacks:4, max-statements:30), Prettier formatting
with 2-space indent and 100-char line width, semantic versioning with Changesets following
conventional commits, OpenTelemetry spans with proper error recording and semantic conventions,
graceful shutdown with cleanup hooks, configuration validation using Zod schemas with
descriptive error messages, meaningful variable names following domain language (no
abbreviations except widely known acronyms), pure functions with no side effects marked with
readonly parameters, defensive programming with input validation at boundaries, SOLID
principles adherence, feature-based module organization over type-based --coverage 70 --strict
true --target ES2022 --moduleResolution bundler --isolatedModules true

### Key Documentation Files

- `README.md` - User-facing documentation
- `CLAUDE.md` - Agent guidance (this file)
- `spec/TESTING-INFRASTRUCTURE.md` - Testing details
- `spec/OPEN-TELEMETRY.md` - Observability setup
- `spec/REVIEW-2025-12-14.md` - Project assessment and roadmap
- `tests/README.md` - Developer test guide
