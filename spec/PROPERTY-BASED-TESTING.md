# Property-Based Testing with fast-check

This document describes property-based testing in shc2es using the [fast-check](https://fast-check.dev/) library.

## What is Property-Based Testing?

Property-based testing verifies that functions uphold **invariants** (properties that should always be true) across thousands of randomly generated inputs, rather than testing specific hardcoded examples.

**Example-based test:**

```typescript
it('should validate valid URLs', () => {
  expect(validateUrl('TEST', 'https://example.com').isOk()).toBe(true);
  expect(validateUrl('TEST', 'http://localhost:9200').isOk()).toBe(true);
});
```

**Property-based test:**

```typescript
it('should accept valid HTTP/HTTPS URLs', () => {
  fc.assert(
    fc.property(fc.webUrl(), (url: string) => {
      const result = validateUrl('TEST', url);
      expect(result.isOk()).toBe(true);
    }),
  );
});
// Generates 100+ different URLs automatically
```

### Benefits

1. **Broader coverage** - Tests hundreds of generated inputs vs. a few hardcoded examples
2. **Edge case discovery** - Finds inputs developers didn't think to test
3. **Invariant documentation** - Properties serve as executable specifications
4. **Fewer tests** - One property replaces multiple example-based tests
5. **Regression prevention** - Catches bugs when assumptions change

## Modules with Property-Based Tests

shc2es uses property-based testing for core modules with pure functions and clear invariants:

| Module                                | Functions Tested                                                         | Property Tests | Purpose                     |
| ------------------------------------- | ------------------------------------------------------------------------ | -------------- | --------------------------- |
| `src/validation.test.ts`              | `validateRequired`, `validateUrl`, `validateBoolean`, `validateLogLevel` | 9              | Input validation invariants |
| `src/transforms.test.ts`              | `extractMetric`, `generateDocId`                                         | 7              | Transformation guarantees   |
| `src/config.test.ts`                  | Path utilities                                                           | 5              | Path generation consistency |
| `src/logger.test.ts`                  | `serializeError`                                                         | 6              | Error handling robustness   |
| `src/poll.test.ts`                    | `isTransientError`, `isPairingButtonError`                               | 8              | Error classification rules  |
| `src/types/errors.test.ts`            | Custom error classes                                                     | 14             | Constructor contracts       |
| `src/types/smart-home-events.test.ts` | `isKnownEventType`                                                       | 3              | Type guard correctness      |

**Total:** 52 property-based tests generating 5,000+ test cases per run.

## Property Examples from the Codebase

### 1. Input Validation (validation.test.ts)

**Property: validateRequired accepts any non-empty string**

```typescript
it('should accept any non-empty string', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
      (value: string) => {
        const result = validateRequired('TEST', value);
        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toBe(value);
      },
    ),
  );
});
```

**Property: validateBoolean is idempotent**

```typescript
it('should be idempotent (same input produces same output)', () => {
  fc.assert(
    fc.property(fc.string(), fc.boolean(), (value: string, defaultValue: boolean) => {
      const result1 = validateBoolean('TEST', value, defaultValue);
      const result2 = validateBoolean('TEST', value, defaultValue);

      expect(result1.isOk()).toBe(result2.isOk());
      if (result1.isOk() && result2.isOk()) {
        expect(result1._unsafeUnwrap()).toBe(result2._unsafeUnwrap());
      }
    }),
  );
});
```

### 2. Transformations (transforms.test.ts)

**Property: extractMetric never throws**

```typescript
it('should never throw, always return Metric or null', () => {
  fc.assert(
    fc.property(arbitrarySmartHomeEvent, (event) => {
      const result = extractMetric(event);

      if (result) {
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('value');
        expect(typeof result.name).toBe('string');
        expect(typeof result.value).toBe('number');
      } else {
        expect(result).toBeNull();
      }
    }),
  );
});
```

**Property: generateDocId is deterministic**

```typescript
it('should be deterministic (same event produces same ID)', () => {
  fc.assert(
    fc.property(arbitrarySmartHomeEvent, (event) => {
      const id1 = generateDocId(event);
      const id2 = generateDocId(event);
      expect(id1).toBe(id2);
    }),
  );
});
```

### 3. Error Handling (logger.test.ts)

**Property: serializeError never throws for any input**

```typescript
it('should never throw for any reasonable input', () => {
  const reasonableValues = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.constant(undefined),
    fc.string().map((msg) => new Error(msg)),
  );

  fc.assert(
    fc.property(reasonableValues, (value) => {
      expect(() => logger.serializeError(value)).not.toThrow();
    }),
  );
});
```

**Property: serializeError always produces ECS-compliant output**

```typescript
it('should always produce ECS-compliant output', () => {
  fc.assert(
    fc.property(reasonableValues, (value) => {
      const result = logger.serializeError(value);

      expect(result['error.message']).toBeDefined();
      expect(result['error.type']).toBeDefined();
      expect(typeof result['error.message']).toBe('string');
      expect(typeof result['error.type']).toBe('string');
    }),
  );
});
```

### 4. Error Classification (poll.test.ts)

**Property: All known transient error codes are identified**

```typescript
it('should identify all known transient error codes', () => {
  const transientCodes = ['TIMEOUT', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH'];

  fc.assert(
    fc.property(fc.constantFrom(...transientCodes), (code: string) => {
      expect(isTransientError(code)).toBe(true);
    }),
  );
});
```

**Property: Transient errors detected in any context**

```typescript
it('should identify transient errors in any message context', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...transientCodes),
      fc.string(),
      fc.string(),
      (code: string, prefix: string, suffix: string) => {
        const message = prefix + code + suffix;
        expect(isTransientError(message)).toBe(true);
      },
    ),
  );
});
```

### 5. Path Utilities (config.test.ts)

**Property: All path functions return absolute paths**

```typescript
it('all path functions should return absolute paths', () => {
  fc.assert(
    fc.property(fc.constant(null), () => {
      const pathFunctions = [
        config.getUserConfigDir,
        config.getCertsDir,
        config.getDataDir,
        config.getLogsDir,
      ];

      pathFunctions.forEach((fn) => {
        const result = fn();
        expect(path.isAbsolute(result)).toBe(true);
      });
    }),
  );
});
```

## Custom Arbitraries

For domain-specific types, create custom arbitraries using `fc.record()`, `fc.oneof()`, and other combinators.

### Example: SmartHomeEvent Arbitrary (transforms.test.ts)

```typescript
const arbitraryTimestamp = fc
  .integer({ min: 1000000000000, max: 2000000000000 })
  .map((ms) => new Date(ms).getTime());

const arbitraryDeviceServiceDataEvent = fc.record({
  '@type': fc.constant('DeviceServiceData' as const),
  id: fc.string({ minLength: 1 }),
  deviceId: fc.string({ minLength: 1 }),
  state: fc.record({
    temperature: fc.double({ min: -50, max: 100 }),
    humidity: fc.double({ min: 0, max: 100 }),
  }),
});

const arbitrarySmartHomeEvent = fc.oneof(
  arbitraryDeviceServiceDataEvent,
  arbitraryDeviceEvent,
  arbitraryRoomEvent,
  arbitraryMessageEvent,
  arbitraryClientEvent,
);
```

**Best practices for custom arbitraries:**

- Use realistic constraints (`min`/`max` for numbers, `minLength` for strings)
- Map primitive arbitraries to domain types
- Use `fc.constantFrom()` for enums/discriminated unions
- Use `fc.option()` for optional fields
- Constrain dates to valid ranges to avoid Invalid Date errors

## Writing Property-Based Tests

### 1. Identify Invariants

Good candidates for property-based testing:

✅ **Pure functions** - Same input always produces same output (idempotency, determinism)  
✅ **Validators** - Accept/reject based on clear rules  
✅ **Transformations** - Never throw, preserve structure, type guarantees  
✅ **Error handlers** - Graceful handling of any input  
✅ **Type guards** - Correct classification across all inputs

❌ **Not suitable:**

- Functions with side effects (I/O, logging, state changes) - use integration tests
- Functions that depend on external state or timing
- Complex workflows - better tested with example-based integration tests

### 2. Choose Appropriate Arbitraries

| Input Type       | Arbitrary                             | Example                 |
| ---------------- | ------------------------------------- | ----------------------- |
| Any string       | `fc.string()`                         | `"hello"`, `""`, `"🎉"` |
| Non-empty string | `fc.string({ minLength: 1 })`         | `"a"`, `"test"`         |
| Enum values      | `fc.constantFrom('a', 'b', 'c')`      | `"a"`, `"b"`, `"c"`     |
| Numbers          | `fc.integer()`, `fc.double()`         | `42`, `-100`, `3.14`    |
| Booleans         | `fc.boolean()`                        | `true`, `false`         |
| Optional values  | `fc.option(fc.string())`              | `"value"`, `null`       |
| URLs             | `fc.webUrl()`                         | `"https://example.com"` |
| Objects          | `fc.record({ key: fc.string() })`     | `{ key: "value" }`      |
| Arrays           | `fc.array(fc.integer())`              | `[1, 2, 3]`, `[]`       |
| Union types      | `fc.oneof(fc.string(), fc.integer())` | `"text"`, `42`          |
| Any value        | `fc.anything()`                       | Use sparingly!          |

### 3. Filter Edge Cases Carefully

Match the implementation's pre-processing logic:

```typescript
// ❌ Bad - doesn't account for trim()
fc.string().filter((s) => !validValues.includes(s));
// Generated: ' ' (whitespace) - returns default, not error

// ✅ Good - matches implementation
fc.string().filter((s) => {
  const trimmed = s.trim();
  return trimmed !== '' && !validValues.includes(trimmed);
});
```

### 4. Assert the Property

```typescript
it('should maintain property X', () => {
  fc.assert(
    fc.property(arbitrary1, arbitrary2, (value1, value2) => {
      const result = functionUnderTest(value1, value2);

      // Assert the invariant
      expect(result).toHaveProperty('expectedField');
      expect(result.someValue).toBeGreaterThan(0);
    }),
    { numRuns: 100 }, // Optional: configure test runs (default: 100)
  );
});
```

## Best Practices

### 1. Use Property Tests for Invariants, Examples for Specific Cases

**Keep both:**

```typescript
describe('validateUrl', () => {
  // Property: Broad coverage
  it('should accept valid HTTP/HTTPS URLs', () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        expect(validateUrl('TEST', url).isOk()).toBe(true);
      }),
    );
  });

  // Example: Specific edge case documentation
  it('should allow trailing slash on root', () => {
    expect(validateUrl('TEST', 'https://example.com/').isOk()).toBe(true);
  });

  // Example: Error message validation
  it('should include env file hint in error message', () => {
    const result = validateUrl('TEST', undefined);
    expect(result._unsafeUnwrapErr().message).toContain('.env');
  });
});
```

### 2. Avoid fc.anything() Unless Testing Defensive Code

**Use fc.anything() when:**

```typescript
// ✅ Testing function should never throw
it('should handle any input gracefully', () => {
  fc.assert(
    fc.property(fc.anything(), (value) => {
      expect(() => serializeError(value)).not.toThrow();
    }),
  );
});
```

**Don't use fc.anything() when:**

```typescript
// ❌ Function expects specific types
function processUser(user: User): string {
  return user.name; // Will crash on arbitrary values
}

// ✅ Use domain-specific arbitrary instead
fc.record({ name: fc.string(), age: fc.integer() });
```

### 3. Configure Test Runs for Different Scenarios

```typescript
fc.assert(
  fc.property(arbitrary, (value) => {
    /* ... */
  }),
  {
    numRuns: 1000, // Run 1000 times instead of default 100
    seed: 42, // Reproducible test runs
    endOnFailure: true, // Stop on first failure
    verbose: true, // Print generated values
  },
);
```

### 4. Reproduce Failures with Seeds

When a property test fails, fast-check prints the seed:

```
Property failed after 48 tests
{ seed: -1561749156, path: "47", endOnFailure: true }
```

Reproduce the exact failure:

```typescript
fc.assert(
  fc.property(...),
  { seed: -1561749156 } // Use printed seed
);
```

### 5. Document Filters and Constraints

```typescript
it('should reject invalid log levels', () => {
  // Excludes empty/whitespace (returns default instead of error)
  const invalidLevels = fc.string().filter((s) => {
    const trimmed = s.trim().toLowerCase();
    return trimmed !== '' && !validLevels.includes(trimmed);
  });

  fc.assert(
    fc.property(invalidLevels, (level) => {
      expect(validateLogLevel('TEST', level).isErr()).toBe(true);
    }),
  );
});
```

## Common Patterns

### Testing "Never Throws"

```typescript
it('should never throw for any input', () => {
  fc.assert(
    fc.property(fc.anything(), (value) => {
      expect(() => functionUnderTest(value)).not.toThrow();
    }),
  );
});
```

### Testing Idempotency

```typescript
it('should produce same result when called multiple times', () => {
  fc.assert(
    fc.property(arbitrary, (input) => {
      const result1 = functionUnderTest(input);
      const result2 = functionUnderTest(input);
      expect(result1).toEqual(result2);
    }),
  );
});
```

### Testing Determinism

```typescript
it('should generate consistent output for same input', () => {
  fc.assert(
    fc.property(arbitrary, (input) => {
      const id1 = generateId(input);
      const id2 = generateId(input);
      expect(id1).toBe(id2);
    }),
  );
});
```

### Testing Classification Rules

```typescript
it('should identify all valid cases', () => {
  const validCases = fc.constantFrom('CASE_A', 'CASE_B', 'CASE_C');

  fc.assert(
    fc.property(validCases, (value) => {
      expect(isValid(value)).toBe(true);
    }),
  );
});

it('should reject all invalid cases', () => {
  const invalidCases = fc.string().filter((s) => !validCases.includes(s));

  fc.assert(
    fc.property(invalidCases, (value) => {
      expect(isValid(value)).toBe(false);
    }),
  );
});
```

### Testing Type Guards

```typescript
it('should correctly identify type across all valid instances', () => {
  const validObjects = fc.record({
    type: fc.constant('expected'),
    id: fc.string(),
    data: fc.anything(),
  });

  fc.assert(
    fc.property(validObjects, (obj) => {
      expect(isExpectedType(obj)).toBe(true);
    }),
  );
});
```

## Debugging Property-Based Tests

### View Generated Values

```typescript
fc.assert(
  fc.property(arbitrary, (value) => {
    console.log('Generated:', value); // See what's being tested
    expect(/* ... */).toBe(/* ... */);
  }),
);
```

### Shrinking

When a property fails, fast-check **shrinks** the input to find the minimal failing case:

```
Original failure: "aaaaaaaaaaaaaaaaaa TIMEOUT bbbbbbbbbbbbbb"
Shrunk to:        "TIMEOUT"
```

This makes debugging easier by removing irrelevant complexity.

### Check Coverage

Property tests should complement, not replace, code coverage tools:

```bash
yarn test:coverage

# Verify property tests cover intended code paths
```

## Running Property-Based Tests

Property tests run alongside example-based tests:

```bash
# All tests (including property-based)
yarn test

# Only unit tests
yarn test:unit

# With coverage
yarn test:coverage

# Watch mode (for TDD)
yarn test:watch

# Specific file
yarn jest src/validation.test.ts
```

Each property test generates 100 test cases by default (configurable), so 52 property tests = 5,200+ individual test executions.

## When NOT to Use Property-Based Testing

❌ **Integration tests** - Testing multiple components together with side effects  
❌ **I/O operations** - File system, network, database interactions  
❌ **Time-dependent logic** - Functions that behave differently based on current time  
❌ **UI interactions** - Better tested with E2E/visual regression tools  
❌ **One-off edge cases** - If there's only one specific case to test, use an example

Use example-based tests for these scenarios.

## Further Reading

- [fast-check documentation](https://fast-check.dev/)
- [Property-based testing introduction](https://fast-check.dev/docs/introduction/)
- [fast-check API reference](https://fast-check.dev/api-reference/)
- [Example-based vs Property-based testing](https://fast-check.dev/docs/core-blocks/arbitraries/)

## Summary

Property-based testing in shc2es:

- **52 property tests** across 7 modules
- **5,000+ test cases** generated per test run
- **Complements** example-based tests (used for specific edge cases, error messages, integration scenarios)
- **Focuses on** pure functions with clear invariants (validators, transformers, error handlers, type guards)
- **Uses fast-check** library with custom domain-specific arbitraries

Property tests provide high-confidence guarantees that functions behave correctly across the entire input space, not just the handful of examples developers think to test.
