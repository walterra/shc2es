# Configuration Validation

**Status:** Done
**Started:** 2025-12-14 23:21:17
**Created:** 2025-12-14-23-05-39
**Agent PID:** 3269

## Description

Add validation for environment variables to provide early, helpful error messages. The configuration validation will:

1. **Required variables** - Check that required env vars are set for each command before attempting operations
2. **URL format validation** - Validate ES_NODE and KIBANA_NODE are valid URLs (protocol, no trailing slash issues)
3. **File path validation** - Check that ES_CA_CERT path exists if provided
4. **Type validation** - Ensure boolean flags (ES_TLS_VERIFY, OTEL_SDK_DISABLED) parse correctly
5. **Early failure** - Fail fast with clear error messages before attempting network operations
6. **Helpful guidance** - Tell users exactly what's wrong and how to fix it (e.g., "Set BSH_HOST in ~/.shc2es/.env")

**Success criteria:**

- Running a command with missing required env vars shows clear error message with location to set it
- Invalid URLs are caught and reported before attempting connection
- Non-existent file paths are reported with the actual path checked
- All existing commands still work with valid configuration
- Tests validate all error paths and helpful messages

## Implementation Plan

- [x] Create validation module (src/validation.ts)
  - URL validator with helpful error messages
  - File path validator that checks existence
  - Boolean parser with error handling
  - Required env var checker with env file location hint
- [x] Define config schemas for each command
  - poll.ts: BSH_HOST (required), BSH_PASSWORD (required), LOG_LEVEL (optional)
  - ingest.ts: ES_NODE (required, URL), ES_PASSWORD (required), ES_USER (optional), ES_CA_CERT (optional, file), ES_TLS_VERIFY (optional, boolean), ES_INDEX_PREFIX (optional), KIBANA_NODE (optional, URL)
  - fetch-registry.ts: BSH_HOST (required)
  - export-dashboard.ts: KIBANA_NODE (required, URL), ES_PASSWORD (required), ES_USER (optional), ES_CA_CERT (optional, file), ES_TLS_VERIFY (optional, boolean)
- [x] Update src/poll.ts (lines 11-15) - Replace inline check with validation call
- [x] Update src/ingest.ts (lines 71-74) - Replace inline check with validation call
- [x] Update src/fetch-registry.ts (lines 10, 42-46) - Replace inline check with validation call
- [x] Update src/export-dashboard.ts (lines 68-75) - Replace inline checks with validation call
- [x] Automated test: Unit tests for validation functions (tests/unit/validation.test.ts)
  - Test URL validation (valid/invalid formats)
  - Test file path validation (exists/not exists)
  - Test boolean parsing (true/false/invalid)
  - Test required var checking with helpful messages
  - Test error message format includes ENV_FILE location
- [x] Automated test: Integration tests for config validation (tests/integration/config-validation.test.ts)
  - Test each command fails gracefully with missing config
  - Test error messages are user-friendly
- [x] User test: Run `yarn poll` without BSH_HOST - should show clear error
- [x] User test: Run `yarn ingest` without ES_NODE - should show clear error
- [x] User test: Run `yarn ingest` with invalid ES_NODE URL - should show validation error
- [x] User test: Run all commands with valid config - should work as before (tested via existing unit tests)

## Review

- [x] All lint checks pass (no ESLint errors)
- [x] All unit tests pass (46 validation tests)
- [x] All integration tests pass (77 total tests)
- [x] Code formatted with Prettier
- [x] TypeScript compiles without errors
- [x] No non-null assertions used - proper type narrowing with explicit checks
- [x] Validation messages are clear and actionable
- [x] All scripts exit with code 1 on validation failure

## Notes

- Refactored validation functions to return `undefined` on failure instead of calling `process.exit()` directly
  - Cleaner separation of concerns - validation functions don't have side effects
  - Caller controls what to do with validation failures
  - More testable - no need to mock `process.exit()`
  - Pattern: `const config = validateXConfig(); if (!config) process.exit(1);`
- All validation functions log errors to `console.error` before returning undefined
- TypeScript type narrowing handled by reassigning validated config to a const
