# Test Redundancy Analysis

Analysis of example-based tests that are now redundant with property-based tests.

## src/validation.test.ts

### Redundant Tests - Can Remove

**validateRequired (lines 49-71):**

- ✂️ Line 49-54: "should return Ok with value when set" → Covered by property test (line 513)
- ✂️ Line 55-63: "should return Err when undefined" → Covered by property test (line 526)
- ✂️ Line 64-71: "should return Err when empty string" → Covered by property test (line 526)

**validateUrl (lines 80-106):**

- ✂️ Line 80-85: "should validate valid HTTP URLs" → Covered by property test (line 545)
- ✂️ Line 86-91: "should validate valid HTTPS URLs" → Covered by property test (line 545)
- ✂️ Line 98-106: "should return Err when missing protocol" → Covered by property test (line 561)
- ✂️ Line 113-120: "should return Err when trailing slash in path" → Covered by property test (line 583)

**validateBoolean (lines 187-208):**

- ✂️ Line 187-192: "should parse 'true' as true" → Covered by property test (line 618)
- ✂️ Line 193-197: "should parse '1' and 'yes' as true" → Covered by property test (line 618)
- ✂️ Line 198-203: "should parse 'false' as false" → Covered by property test (line 618)
- ✂️ Line 204-208: "should parse '0' and 'no' as false" → Covered by property test (line 618)

**validateLogLevel (lines 225-233, 250-258):**

- ✂️ Line 225-233: "should validate valid log levels" → Covered by property test (line 641)
- ✂️ Line 250-258: "should return Err on invalid level" → Covered by property test (line 653)

**Total: 12 redundant tests**

### Keep (Not Redundant)

- Line 72-77: "should include env file hint in error message" (tests specific error message format)
- Line 92-97: "should trim whitespace" (specific transformation behavior)
- Line 107-112: "should return Err when invalid URL" (malformed URL edge case)
- Line 121-126: "should allow trailing slash on root" (specific edge case not fully covered)
- Line 127-143: Optional parameter handling tests
- Line 209-213: "should return default when empty" (default value behavior)
- Line 214-223: "should return Err on invalid value" (specific error handling)
- Line 234-242: Case normalization and trimming (specific transformations)
- Line 243-249: Default value handling

## src/config.test.ts

### Redundant Tests - Can Remove

**Path functions (lines 43-77):**

- ✂️ Line 43-47: "getUserConfigDir should return path in home directory" → Covered by property tests (line 189, 206)
- ✂️ Line 48-52: "getCertsDir should return certs subdirectory" → Covered by property tests (line 189, 206, 243)
- ✂️ Line 53-57: "getDataDir should return data subdirectory" → Covered by property tests (line 189, 206, 243)
- ✂️ Line 58-62: "getLogsDir should return logs subdirectory" → Covered by property tests (line 189, 206, 243)
- ✂️ Line 63-67: "getCertFile should return cert file path" → Covered by property tests (line 189, 206, 254)
- ✂️ Line 68-72: "getKeyFile should return key file path" → Covered by property tests (line 189, 206, 254)
- ✂️ Line 73-77: "getEnvFile should return env file path" → Covered by property tests (line 189, 206, 254)

**Total: 7 redundant tests**

### Keep (Not Redundant)

- Line 78-82: "getLocalEnvFile should return local env file path" (tests cwd-based path, different logic)
- All ensureConfigDirs, findEnvFile, getConfigPaths, environment loading tests (test I/O and side effects)

## src/transforms.test.ts

### Redundant Tests - Can Remove

**None** - All example-based tests should be kept because:

- They test specific real-world event structures from fixtures
- They verify correct parsing of actual Bosch API responses
- Property tests verify invariants; examples verify concrete behavior with real data
- Complementary rather than redundant

### Keep All

- All extractMetric examples (lines 13-87) - Test real event structures
- All generateDocId examples (lines 89-141) - Test real event ID generation

## src/types/smart-home-events.test.ts

### Redundant Tests - Can Remove

**isKnownEventType (lines 232-247):**

- ✂️ Line 232-239: "should return true for known event types" → Covered by property test (line 249)
- ✂️ Line 240-247: "should return false for unknown event types" → Covered by property test (line 267)

**Total: 2 redundant tests**

### Keep (Not Redundant)

- All type parsing tests (DeviceServiceDataEvent, DeviceEvent, etc.) - Test TypeScript types and fixtures
- All discriminated union tests - Test TypeScript type narrowing
- All OpenTelemetry tests - Test trace context fields

## Summary

**Total Redundant Tests: 21**

- validation.test.ts: 12 tests
- config.test.ts: 7 tests
- transforms.test.ts: 0 tests
- smart-home-events.test.ts: 2 tests

**Estimated savings:**

- ~200 lines of test code
- Faster test execution (~0.5-1s)
- Reduced maintenance burden
- Property tests provide better coverage with fewer LOC

**Recommendation:**
Remove redundant tests to:

1. Reduce duplication
2. Simplify maintenance
3. Keep focus on property invariants vs. specific examples
4. Preserve tests that verify specific edge cases, error messages, or transformations not fully covered by properties
