# Property-Based Testing Migration Candidates

Analysis of remaining unit tests suitable for property-based testing migration.

## High Priority Candidates

### 1. src/types/errors.test.ts - ⭐⭐⭐⭐⭐ EXCELLENT CANDIDATE

**Current:** 90+ example-based tests for error construction, inheritance, serialization

**Property-based opportunities:**

#### Error Construction Properties

```typescript
// Property: All error constructors preserve message and code
fc.property(fc.string(), fc.string(), fc.string(), (message, variable, code) => {
  const error = new ValidationError(message, variable, code);
  expect(error.message).toBe(message);
  expect(error.code).toBe(code);
  expect(error.variable).toBe(variable);
});

// Property: Error cause chains are preserved
fc.property(fc.string(), fc.option(fc.anything()), (message, cause) => {
  const error = new ValidationError(message, 'VAR', 'CODE', cause);
  expect(error.cause).toBe(cause);
});
```

**Redundant tests to remove (24 tests):**

- Line 11-36: Basic SHC2ESError properties (5 tests) → Property: name, stack, cause preservation
- Line 44-80: ValidationError construction (7 tests) → Property: fields preserved
- Line 97-133: ConfigError construction (7 tests) → Property: path handling
- Line 159-202: FileSystemError construction (5 tests) → Property: path handling

**Keep:**

- Error inheritance tests (type system validation)
- Error chain with causes (complex scenario)
- Serialization tests (could be property-based too)

**Impact:** ~24 tests → ~6-8 property tests

---

### 2. src/poll.test.ts - ⭐⭐⭐⭐ VERY GOOD CANDIDATE

**Current:** Error classification tests with multiple hardcoded examples

**Property-based opportunities:**

#### isTransientError Properties

```typescript
// Property: All network error codes are transient
const transientCodes = ['TIMEOUT', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH'];
fc.property(fc.constantFrom(...transientCodes), (code) => {
  expect(isTransientError(code)).toBe(true);
});

// Property: Authentication errors are never transient
const authErrors = ['AUTHENTICATION_FAILED', 'UNAUTHORIZED', 'INVALID_CREDENTIALS'];
fc.property(fc.constantFrom(...authErrors), (error) => {
  expect(isTransientError(error)).toBe(false);
});

// Property: Arbitrary unknown errors are not transient
fc.property(
  fc.string().filter((s) => !knownTransientCodes.includes(s)),
  (unknownCode) => {
    expect(isTransientError(unknownCode)).toBe(false);
  },
);
```

#### isPairingButtonError Properties

```typescript
// Property: Messages containing pairing keywords are detected
fc.property(fc.string(), fc.constantFrom('press', 'button', 'pairing'), (prefix, keyword) => {
  const message = prefix + keyword;
  expect(isPairingButtonError(message)).toBe(true);
});
```

**Redundant tests to remove (10 tests):**

- Line 99-136: isTransientError examples (8 tests) → 3-4 properties
- Line 139-159: isPairingButtonError examples (5 tests) → 2 properties

**Keep:**

- createBridge, processEvent, processEvents (integration/behavior tests)

**Impact:** ~10 tests → ~5-6 property tests

---

### 3. src/logger.test.ts (serializeError) - ⭐⭐⭐ GOOD CANDIDATE

**Current:** 8 example-based tests for error serialization

**Property-based opportunities:**

```typescript
// Property: serializeError never throws
fc.property(fc.anything(), (value) => {
  expect(() => serializeError(value)).not.toThrow();
});

// Property: Error messages are preserved
fc.property(fc.string(), (message) => {
  const error = new Error(message);
  const result = serializeError(error);
  expect(result['error.message']).toBe(message);
});

// Property: All errors produce ECS-compliant output
fc.property(fc.anything(), (value) => {
  const result = serializeError(value);
  expect(result).toHaveProperty('error.message');
  expect(result).toHaveProperty('error.type');
});

// Property: Cause chains are recursively serialized
fc.property(fc.string(), fc.string(), (topMessage, causeMessage) => {
  const cause = new Error(causeMessage);
  const error = new Error(topMessage, { cause });
  const result = serializeError(error);
  expect(result['error.cause']).toBeDefined();
  expect(result['error.cause']['error.message']).toBe(causeMessage);
});
```

**Redundant tests to remove (6 tests):**

- Line 117-175: Basic serialization (6 tests) → 4 properties

**Keep:**

- Custom error class test (specific behavior)
- ECS compliance test (important validation)

**Impact:** ~6 tests → ~4 property tests

---

### 4. src/types/kibana-saved-objects.test.ts - ⭐⭐⭐ GOOD CANDIDATE

**Current:** Type guard tests with repetitive patterns

**Property-based opportunities:**

```typescript
// Property: isExportMetadata accepts objects with exportedCount
fc.property(fc.integer(), fc.integer(), (exported, missing) => {
  const metadata = { exportedCount: exported, missingRefCount: missing };
  expect(isExportMetadata(metadata)).toBe(true);
});

// Property: isExportMetadata rejects non-objects
fc.property(fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)), (value) => {
  expect(isExportMetadata(value)).toBe(false);
});

// Property: isDashboard type guard is consistent
fc.property(fc.string(), fc.string(), (id, title) => {
  const dashboard = {
    type: 'dashboard',
    id,
    attributes: { title },
  };
  expect(isDashboard(dashboard)).toBe(true);
});
```

**Redundant tests to remove (8 tests):**

- Line 14-52: isExportMetadata examples (6 tests) → 2-3 properties
- Line 54-79: isDashboard examples (2 tests) → 1 property

**Keep:**

- Type narrowing tests (TypeScript behavior validation)
- Complex API response tests (integration validation)

**Impact:** ~8 tests → ~3-4 property tests

---

## Medium Priority Candidates

### 5. src/validation.test.ts - Additional opportunities

**Current opportunities in remaining tests:**

```typescript
// Property: Optional parameter handling is consistent
fc.property(fc.string(), fc.boolean(), (value, required) => {
  const result = validateUrl('TEST', value, { required });
  // Verify consistent behavior for empty values
});

// Property: Error messages always include variable name
fc.property(fc.string(), (varName) => {
  const result = validateRequired(varName, undefined);
  expect(result._unsafeUnwrapErr().message).toContain(varName);
});
```

**Redundant tests to identify:**

- Optional parameter tests (4-5 tests) → 2 properties
- Error message format tests (could be property-based)

**Impact:** ~4 tests → ~2 property tests

---

### 6. src/config.test.ts - Additional opportunities

**Current opportunities:**

```typescript
// Property: findEnvFile behaves consistently
fc.property(fc.boolean(), fc.boolean(), (localExists, globalExists) => {
  // Test preference order is deterministic
});
```

**Impact:** Minimal - most tests are I/O based (keep as-is)

---

## Summary

### Estimated Impact

| File                         | Current Tests | Redundant | Property Tests | Net Change    |
| ---------------------------- | ------------- | --------- | -------------- | ------------- |
| errors.test.ts               | 90            | -24       | +6             | -18 tests     |
| poll.test.ts                 | 30+           | -10       | +5             | -5 tests      |
| logger.test.ts               | 17            | -6        | +4             | -2 tests      |
| kibana-saved-objects.test.ts | 40+           | -8        | +4             | -4 tests      |
| validation.test.ts           | 10            | -4        | +2             | -2 tests      |
| **TOTAL**                    | **187+**      | **-52**   | **+21**        | **-31 tests** |

### Benefits

1. **Broader coverage** - Properties test thousands of generated cases
2. **Fewer tests** - Reduce from ~187 to ~156 tests (-17%)
3. **Better invariant documentation** - Properties make guarantees explicit
4. **Easier maintenance** - Fewer brittle example-based tests

### Recommendation Priority

1. **Start with errors.test.ts** (biggest impact, clearest patterns)
2. **Then poll.test.ts** (error classification is perfect for PBT)
3. **Then logger.test.ts** (serializeError function)
4. **Finally kibana-saved-objects.test.ts** (type guards)

### Implementation Strategy

1. Add property-based tests first (don't remove anything yet)
2. Verify properties pass and provide better coverage
3. Remove redundant example-based tests
4. Keep high-value tests (edge cases, integration, complex scenarios)
5. Document property invariants in test descriptions

### Files NOT Suitable for PBT

- **instrumentation.test.ts** - Integration tests for OpenTelemetry
- **export-dashboard.test.ts** - Integration tests with external services
- **transforms.test.ts** - Already has PBT + fixture-based tests are valuable
