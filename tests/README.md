# Test Suite

This directory contains the test suite for shc2es.

## Structure

```
tests/
├── unit/              # Unit tests for individual modules
│   ├── config.test.ts
│   ├── logger.test.ts
│   └── poll.test.ts
├── mocks/            # Mock implementations of external dependencies
│   └── bosch-smart-home-bridge.mock.ts
├── utils/            # Test utilities and helpers
│   └── test-helpers.ts
└── setup.ts          # Global test setup
```

## Running Tests

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage
yarn test:coverage

# Run tests in CI mode
yarn test:ci
```

## Coverage Thresholds

The test suite enforces minimum coverage thresholds:
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

## Writing Tests

### Unit Tests

Unit tests should:
- Test a single module or function in isolation
- Mock all external dependencies
- Use the mocks provided in `tests/mocks/`
- Be fast and deterministic

Example:
```typescript
import { createTempDir, cleanupTempDir } from '../utils/test-helpers';

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

### Test Helpers

Use the utilities in `tests/utils/test-helpers.ts`:
- `createTempDir()` - Create temporary directory for test isolation
- `cleanupTempDir()` - Clean up temporary directory
- `suppressConsole()` - Suppress console output during tests

### Mocks

#### Bosch Smart Home Bridge
```typescript
import { mockBoschSmartHomeBridge } from '../mocks/bosch-smart-home-bridge.mock';

jest.mock('bosch-smart-home-bridge', () => mockBoschSmartHomeBridge);
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
yarn jest tests/unit/config.test.ts

# Run tests matching a pattern
yarn jest --testNamePattern="should load existing certificates"

# Run with verbose output
yarn jest --verbose

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand
```

## CI/CD Integration

Tests run automatically in GitHub Actions on:
- Every push to main
- Every pull request
- Node.js versions: 20.x, 22.x

See `.github/workflows/test.yml` for CI configuration.
