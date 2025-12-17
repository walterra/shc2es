# Test Suite

This directory contains the test suite for shc2es, including both unit tests and E2E (end-to-end) integration tests.

## Quick Start

```bash
# Run all tests (unit + E2E)
yarn test:all

# Run only unit tests (fast)
yarn test:unit

# Run only E2E tests (requires Docker)
yarn test:e2e
```

## Structure

**Co-located unit tests** (following 2025 best practices):

Unit tests are co-located with their source files in `src/`:

```
src/
├── config.ts
├── config.test.ts         # Unit tests for config.ts
├── logger.ts
├── logger.test.ts         # Unit tests for logger.ts
├── validation.ts
├── validation.test.ts     # Unit tests for validation.ts
└── types/
    ├── errors.ts
    └── errors.test.ts     # Unit tests for errors.ts
```

**E2E tests** (in `tests/e2e/`):

```
tests/e2e/
├── poll.e2e.test.ts           # Poll flow with mock controller
├── fetch-registry.e2e.test.ts # Registry fetching
├── ingest.e2e.test.ts         # Elasticsearch ingestion
└── dashboard.e2e.test.ts      # Kibana dashboard import/export
```

**Shared test infrastructure** (in `tests/`):

```
tests/
├── e2e/              # E2E integration tests
├── mocks/            # Mock implementations
│   ├── bosch-smart-home-bridge.mock.ts
│   └── bosch-controller-server.ts  # Mock HTTP server
├── fixtures/         # Test data
│   ├── smart-home-events.json
│   ├── controller-devices.json
│   └── controller-rooms.json
├── utils/            # Test utilities
│   ├── test-helpers.ts
│   └── containers.ts         # TestContainers helpers
├── setup.ts          # Unit test setup
└── setup.e2e.ts      # E2E test setup
```

**Rationale**: Co-locating unit tests with source files reduces cognitive load. E2E tests are separate since they test multiple components together.

## Running Tests

### Unit Tests (Fast)

```bash
# Run all unit tests
yarn test:unit

# Run tests in watch mode
yarn test:watch

# Run tests with coverage
yarn test:coverage

# Run tests in CI mode
yarn test:ci
```

### E2E Tests (Requires Docker)

```bash
# Run all E2E tests (~40-45 seconds)
yarn test:e2e

# Run specific E2E test suite
yarn test:e2e tests/e2e/poll.e2e.test.ts
yarn test:e2e tests/e2e/ingest.e2e.test.ts

# Run with container monitoring
docker stats  # In separate terminal
yarn test:e2e
```

### Combined

```bash
# Run both unit and E2E tests
yarn test:all
```

## Test Coverage

### Unit Tests

**Coverage thresholds** (enforced):

- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

**Current coverage:** 218 unit tests covering core modules (config, logger, validation, transforms, types).

**Excluded from coverage** (tested via E2E):

- `src/cli.ts` - CLI entry point
- `src/poll.ts` - Long polling script
- `src/ingest.ts` - Ingestion script
- `src/fetch-registry.ts` - Registry fetching script
- `src/export-dashboard.ts` - Dashboard export script

### E2E Tests

**Current coverage:** 18 E2E tests covering complete data flows:

- Poll flow: 4 tests
- Registry flow: 3 tests
- Ingest flow: 5 tests
- Dashboard flow: 6 tests

## Writing Tests

### Unit Tests

Unit tests should:

- Be co-located with the source file they test (e.g., `config.test.ts` next to `config.ts`)
- Test a single module or function in isolation
- Mock all external dependencies
- Use the mocks provided in `tests/mocks/`
- Be fast and deterministic

Example (`src/my-module.test.ts`):

```typescript
import { createTempDir, cleanupTempDir } from '../tests/utils/test-helpers';

describe('myModule', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir('test-');
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should do something', () => {
    // Test implementation
  });
});
```

### Property-Based Testing

Property-based tests use `fast-check` to verify that functions uphold invariants across thousands of randomly generated inputs. This complements example-based tests by exploring edge cases automatically.

**Key modules with property-based tests:**

- **Validation functions** (`src/validation.test.ts`):
  - `validateRequired()` - Any non-empty string should pass
  - `validateUrl()` - Valid HTTP/HTTPS URLs should parse consistently
  - `validateBoolean()` - String-to-boolean conversion should be idempotent
  - `validateLogLevel()` - Only valid log levels should pass

- **Transformation functions** (`src/transforms.test.ts`):
  - `extractMetric()` - Should never throw, always return Metric or null
  - `generateDocId()` - Should be deterministic (same input → same output)

- **Config path utilities** (`src/config.test.ts`):
  - All path functions should return absolute paths
  - Paths should always start with user home directory

Example property-based test:

```typescript
import * as fc from 'fast-check';

describe('Property-based tests', () => {
  it('should accept any non-empty string', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (value) => {
          const result = validateRequired('TEST', value);
          expect(result.isOk()).toBe(true);
          expect(result._unsafeUnwrap()).toBe(value);
        },
      ),
    );
  });
});
```

**Benefits:**

- Catches edge cases not covered by example-based tests
- Generates hundreds of test cases per property automatically
- Provides better confidence in function correctness
- Shrinks failing inputs to minimal reproducible cases

**Running property-based tests:**

Property-based tests run alongside example-based tests with:

```bash
yarn test          # All tests including property-based
yarn test:unit     # Unit tests including property-based
yarn test:coverage # With coverage report
```

Each property test generates 100+ test cases by default (configurable via `fc.assert` options).

### Test Helpers

Use the utilities in `tests/utils/test-helpers.ts`:

- `createTempDir()` - Create temporary directory for test isolation
- `cleanupTempDir()` - Clean up temporary directory
- `suppressConsole()` - Suppress console output during tests

Import from co-located tests:

```typescript
import { createTempDir } from '../tests/utils/test-helpers';
```

Import from nested tests (e.g., `src/types/*.test.ts`):

```typescript
import { createTempDir } from '../../tests/utils/test-helpers';
```

### Mocks

#### Bosch Smart Home Bridge

From co-located tests:

```typescript
jest.mock('bosch-smart-home-bridge', () => {
  return require('../tests/mocks/bosch-smart-home-bridge.mock').mockBoschSmartHomeBridge;
});
```

## Test Environment

Tests run with:

- `NODE_ENV=test`
- `LOG_LEVEL=silent` (suppress logs)
- `OTEL_SDK_DISABLED=true` (disable OpenTelemetry)
- Mock environment variables for required config

## Best Practices

1. **Isolation**: Each test should be independent and not affect others
2. **Cleanup**: Always clean up temporary files and resources
3. **Mocking**: Mock external dependencies to ensure tests are fast and reliable
4. **Naming**: Use descriptive test names that explain what is being tested
5. **Assertions**: Use specific assertions (e.g., `toMatchObject` over `toBe`)
6. **Coverage**: Aim for high coverage but prioritize meaningful tests over 100% coverage

## Debugging Tests

```bash
# Run a specific test file
yarn jest src/config.test.ts

# Run all tests in a directory
yarn jest src/types/

# Run tests matching a pattern
yarn jest --testNamePattern="should load existing certificates"

# Run with verbose output
yarn jest --verbose

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand
```

## E2E Testing Infrastructure

E2E tests use **TestContainers** to spin up real Elasticsearch and Kibana instances in Docker containers. Tests run against actual services (not mocks) to validate the complete data pipeline.

**Key features:**

- **Ephemeral ports** - Avoids conflicts with running services
- **Docker bridge networking** - Containers can communicate
- **Automatic cleanup** - Containers removed after tests
- **ARM64 support** - Works on Apple Silicon

**For detailed E2E testing documentation, see:** [`spec/E2E-TESTING.md`](../spec/E2E-TESTING.md)

## CI/CD Integration

Tests run automatically in GitHub Actions on:

- Every push to main
- Every pull request
- Node.js versions: 20.x, 22.x
- **Unit tests** run on every commit
- **E2E tests** run on main/PRs (require Docker)

See `.github/workflows/test.yml` for CI configuration.
