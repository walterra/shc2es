# Development Guide

This document covers the development workflow, testing infrastructure, release process, and CI/CD setup for shc2es.

## Quick Start

```bash
# Install dependencies
yarn install

# Run type checking
yarn tsc --noEmit

# Build the project
yarn build

# Run unit tests (fast, no Docker required)
yarn test

# Run E2E tests (requires Docker)
yarn test:e2e

# Run linter
yarn lint

# Format code
yarn format

# Check formatting
yarn format:check
```

## Development Workflow

### 1. Make Changes

Edit TypeScript files in `src/`. Unit tests are co-located with source files (e.g., `config.test.ts` next to `config.ts`).

### 2. Write Tests

- **Unit tests**: Co-locate with source files (e.g., `src/config.test.ts`)
- **E2E tests**: Place in `tests/e2e/` for integration scenarios
- **Property-based tests**: Use `fast-check` for invariant testing

See [tests/README.md](tests/README.md) for detailed testing guidelines.

### 3. Run Tests

```bash
# Fast feedback loop - unit tests only
yarn test

# Full validation - includes E2E tests with Docker
yarn test:all

# Watch mode for TDD
yarn test:watch

# Coverage report
yarn test:coverage
```

### 4. Check Code Quality

```bash
# Type checking
yarn tsc --noEmit

# Linting
yarn lint

# Auto-fix linting issues
yarn lint:fix

# Format code
yarn format

# Validate formatting
yarn format:check

# Validate documentation
yarn lint:docs

# Validate Mermaid diagrams
yarn mermaid:validate
```

### 5. Create Changeset

Create a changeset file for versioning (don't use `yarn changeset` - it's interactive):

```bash
# Create file in .changeset/ with descriptive name
cat > .changeset/fix-logger-bug.md << 'EOF'
---
"shc2es": patch
---

Fix logger timestamp formatting issue in poll command
EOF
```

**Version bump types:**

- `patch` - Bug fixes, minor updates (0.0.x)
- `minor` - New features, backward compatible (0.x.0)
- `major` - Breaking changes (x.0.0)

**Changeset message guidelines:**

- ✅ **Good**: "Add Jest testing infrastructure with 70% coverage thresholds and automated CI testing"
- ❌ **Bad**: Listing every file changed, configuration option, or implementation detail
- Focus on **user-facing value** or **high-level feature addition**
- Keep it **one line** when possible (two max)
- Think: "What would a user want to see in release notes?"

### 6. Commit Changes

The project uses Husky and lint-staged for pre-commit hooks:

```bash
git add .
git commit -m "feat: add new feature"
# Triggers automatic linting and formatting on staged files
```

## Testing Infrastructure

### Test Types

| Type           | Location                  | Purpose                       | Speed | Docker |
| -------------- | ------------------------- | ----------------------------- | ----- | ------ |
| Unit           | `src/*.test.ts`           | Test individual modules       | Fast  | No     |
| Property-based | `src/*.test.ts`           | Test invariants across inputs | Fast  | No     |
| E2E            | `tests/e2e/*.e2e.test.ts` | Test complete data flows      | Slow  | Yes    |

### Running Tests

```bash
# Unit tests only (fast, no Docker)
yarn test
yarn test:unit

# E2E tests only (requires Docker)
yarn test:e2e

# All tests
yarn test:all

# Watch mode for TDD
yarn test:watch

# Coverage report
yarn test:coverage

# CI mode (used in GitHub Actions)
yarn test:ci
```

### Test Coverage

**Unit test thresholds (enforced):**

- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

**Current coverage:**

- 218 unit tests covering core modules
- 18 E2E tests covering complete data flows
- Property-based tests for validation and transformation functions

**Excluded from unit coverage** (tested via E2E):

- `src/cli.ts` - CLI entry point
- `src/poll.ts` - Long polling script
- `src/ingest.ts` - Ingestion script
- `src/fetch-registry.ts` - Registry fetching script
- `src/export-dashboard.ts` - Dashboard export script

### Property-Based Testing

Uses `fast-check` to verify functions uphold invariants across thousands of randomly generated inputs:

```typescript
import * as fc from 'fast-check';

it('should accept any non-empty string', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1 }), (value) => {
      const result = validateRequired('TEST', value);
      expect(result.isOk()).toBe(true);
    }),
  );
});
```

**Benefits:**

- Catches edge cases automatically
- Generates 100+ test cases per property
- Shrinks failing inputs to minimal reproducible cases

See [spec/PROPERTY-BASED-TESTING.md](spec/PROPERTY-BASED-TESTING.md) for detailed documentation.

### E2E Testing

Uses TestContainers to spin up real Elasticsearch and Kibana instances in Docker:

```bash
# Run E2E tests (requires Docker)
yarn test:e2e

# Monitor containers during test execution
docker stats  # In separate terminal
```

**E2E test suites:**

- `poll.e2e.test.ts` - Long polling with mock controller server
- `fetch-registry.e2e.test.ts` - Device registry fetching
- `ingest.e2e.test.ts` - Elasticsearch ingestion and index setup
- `dashboard.e2e.test.ts` - Kibana dashboard import/export

See [spec/E2E-TESTING.md](spec/E2E-TESTING.md) for detailed E2E testing documentation.

## Code Quality Standards

### TypeScript Configuration

- **Target**: ES2022
- **Module resolution**: bundler
- **Strict mode**: enabled
- **Isolated modules**: enabled

### ESLint Rules

- No explicit `any` types
- No unsafe TypeScript operations
- Complexity guards:
  - Max lines per file: 300
  - Max lines per function: 50
  - Cyclomatic complexity: 10
  - Max depth: 3
  - Max parameters: 4
  - Max nested callbacks: 4
  - Max statements: 30

### Code Style

- **Prettier**: 2-space indent, 100-char line width
- **Functional programming**: Immutable data structures
- **Error handling**: Result/Either pattern with `neverthrow`
- **Logging**: Pino structured logging with correlation IDs
- **Documentation**: Comprehensive JSDoc comments

See CLAUDE.md for detailed coding style guidelines.

## Documentation

### Documentation Files

- `README.md` - User-facing documentation (installation, usage, configuration)
- `CLAUDE.md` - Agent guidance (debugging, architecture, restrictions)
- `DEVELOPMENT.md` - This file (development workflow, testing, releases)
- `CONTRIBUTING.md` - Contribution guidelines
- `spec/*.md` - Technical specifications and detailed documentation

### Documentation Linting

Uses `textlint` to enforce documentation quality:

```bash
# Lint all documentation files
yarn lint:docs

# Lint specific file
yarn lint:docs README.md

# Auto-fix issues
yarn lint:docs --fix
```

### Diagram Validation

Mermaid diagrams are validated to ensure they render correctly:

```bash
# Validate all Mermaid diagrams in documentation
yarn mermaid:validate
```

## Local Development Environment

### Prerequisites

- **Node.js**: 20.x or 22.x
- **Yarn**: 1.x (classic)
- **Docker**: Required for E2E tests and local Elasticsearch

### Optional: Local Elasticsearch

For manual testing and development:

```bash
# Install elastic-start-local (one-time setup)
yarn es-dev:install

# Start Elasticsearch + Kibana
yarn es-dev:start

# Stop containers
yarn es-dev:stop

# Remove containers
yarn es-dev:down

# View logs
yarn es-dev:logs
```

Elasticsearch will be available at:

- Elasticsearch: https://localhost:9200
- Kibana: http://localhost:5601
- Default credentials: `elastic` / `changeme`

### Optional: OpenTelemetry Collector

For observability during development:

```bash
# Start EDOT Collector
yarn otel:collector:start

# View collector logs
yarn otel:collector:logs

# Stop collector
yarn otel:collector:stop
```

Configure environment variables in `.env`:

```bash
OTEL_SERVICE_NAME=shc2es
ES_NODE=https://localhost:9200
ELASTIC_API_KEY=your_api_key_here
```

See [spec/OPEN-TELEMETRY.md](spec/OPEN-TELEMETRY.md) for detailed OpenTelemetry documentation.

## Release Process

This project uses [Changesets](https://github.com/changesets/changesets) for versioning and [GitHub Actions](https://github.com/features/actions) for automated releases.

### Automated Release Flow

1. **Push to main with changesets** - Creates/updates a PR titled "Version Packages"
2. **Merge the release PR** - Triggers the publish workflow:
   - Builds the TypeScript project
   - Publishes to npm with OIDC provenance
   - Creates a GitHub Release with changelog from changeset descriptions

### Manual Release Commands

```bash
# Version packages (updates version and CHANGELOG.md)
yarn version-packages

# Build and publish to npm
yarn release
```

### npm Provenance

Releases use npm's OIDC provenance for supply chain security. This:

- Cryptographically links the package to its source commit
- Requires no long-lived npm tokens (uses GitHub's `id-token: write` permission)
- Shows a "Provenance" badge on npmjs.com

## CI/CD Workflows

### CI Workflow (`.github/workflows/ci.yml`)

Runs on every push and PR to main with Node.js 20.x and 22.x:

**Steps:**

1. Install dependencies
2. Lint TypeScript code
3. Lint documentation (textlint)
4. Check code formatting (Prettier)
5. Validate Mermaid diagrams
6. Type check (tsc --noEmit)
7. Build (tsc)
8. Run unit tests with coverage
9. Upload coverage to Codecov (Node.js 22.x only)
10. Archive coverage report as artifact

**E2E test job:**

- Runs on Node.js 22.x only
- Pulls Docker images (Elasticsearch, Kibana)
- Runs E2E tests with 15-minute timeout
- Cleans up containers after execution

### Release Workflow (`.github/workflows/release.yml`)

Runs on push to main:

**Jobs:**

1. **Version PR creation/update**: Uses `changesets/action` to create/update "Version Packages" PR
2. **Publish to npm**: Triggered when version PR is merged
   - Builds TypeScript
   - Publishes to npm with provenance
   - Creates GitHub Release

### Scorecard Workflow (`.github/workflows/scorecard.yml`)

Runs weekly to assess security best practices:

- OSSF Scorecard analysis
- CodeQL security scanning
- Results published to GitHub Security tab

## Debugging

### Application Logs

```bash
# View today's logs (pretty formatted)
yarn logs

# Follow logs in real-time
yarn logs:tail

# Show only errors and warnings
yarn logs:errors

# Raw JSON logs (for parsing/analysis)
yarn logs:raw
yarn logs:raw:tail
```

### Data Logs

```bash
# Show last 20 smart home events
yarn data

# Follow events in real-time
yarn data:tail
```

### Log Levels

| Level | Value | Use               |
| ----- | ----- | ----------------- |
| fatal | 60    | App crash         |
| error | 50    | Errors            |
| warn  | 40    | Warnings          |
| info  | 30    | Normal operation  |
| debug | 20    | Verbose debugging |

Set `LOG_LEVEL` environment variable in `~/.shc2es/.env`:

```bash
LOG_LEVEL=debug  # Enable verbose logging
LOG_LEVEL=info   # Normal operation (default)
```

## Troubleshooting

### Tests Failing

```bash
# Clear Jest cache
yarn jest --clearCache

# Run tests with verbose output
yarn jest --verbose

# Run specific test file
yarn jest src/config.test.ts
```

### Build Issues

```bash
# Clean build artifacts
rm -rf dist/

# Rebuild
yarn build

# Check for type errors
yarn tsc --noEmit
```

### Docker Issues (E2E Tests)

```bash
# Clean up orphaned containers
docker ps -aq | xargs docker rm -f

# Pull required images
docker pull docker.elastic.co/elasticsearch/elasticsearch:9.2.2
docker pull docker.elastic.co/kibana/kibana:9.2.2

# Check Docker is running
docker info
```

### Dependency Issues

```bash
# Clean install
rm -rf node_modules/ yarn.lock
yarn install
```

## Project Structure

```
src/
  cli.ts               # CLI command router
  config.ts            # Centralized config
  config.test.ts       # Co-located unit tests
  logger.ts            # Pino logger setup
  logger.test.ts
  instrumentation.ts   # OpenTelemetry setup
  validation.ts        # Data validation
  transforms.ts        # Data transformations
  poll.ts              # Long polling CLI
  fetch-registry.ts    # Device registry fetching
  export-dashboard.ts  # Kibana dashboard export/import

  ingest/              # Elasticsearch ingestion modules
    main.ts            # Main entry point
    bulk-import.ts     # Batch NDJSON import
    watch.ts           # Live file watching
    transform.ts       # Event transformation
    setup.ts           # Index/template setup

  types/               # TypeScript type definitions
    errors.ts
    smart-home-events.ts
    kibana-saved-objects.ts

tests/
  e2e/                 # E2E integration tests
  mocks/               # Mock implementations
  fixtures/            # Test data files
  utils/               # Test helpers
  setup.ts             # Jest test setup
  setup.e2e.ts         # E2E test setup

spec/                  # Technical specifications
  E2E-TESTING.md
  LOGGING.md
  OPEN-TELEMETRY.md
  PROPERTY-BASED-TESTING.md
  REVIEW-2025-12-14.md
  TODO.md

.github/workflows/     # GitHub Actions workflows
  ci.yml               # Continuous integration
  release.yml          # Automated releases
  scorecard.yml        # Security scanning
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Contribution guidelines
- Code of conduct
- Pull request process
- Issue reporting

## Resources

- [Jest Documentation](https://jestjs.io/)
- [TestContainers Documentation](https://testcontainers.com/)
- [Changesets Documentation](https://github.com/changesets/changesets)
- [OpenTelemetry Documentation](https://opentelemetry.io/)
- [Elasticsearch JavaScript Client](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/index.html)
