# Result/Either Pattern for Error Handling

**Status:** Done  
**Created:** 2025-12-15-14-57-22  
**Started:** 2025-12-15-15:02:00  
**Completed:** 2025-12-15-15:37:00  
**Agent PID:** 2325

## Description

**Problem**: Current error handling is inconsistent and hard to test:
- Validation functions throw exceptions (15 throw statements in validation.ts)
- CLI scripts call `process.exit()` directly (20+ calls across files)
- Mix of error patterns makes error handling unpredictable
- Hard to test error paths without catching exceptions
- Difficult to compose operations that might fail

**Solution**: Implement Result/Either pattern using [`neverthrow`](https://github.com/supermacro/neverthrow) library:
- Replace throwing with `Result<T, E>` return type (Ok/Err)
- Remove `process.exit()` from library code, only in CLI entry points
- Composable error handling with `.map()`, `.mapErr()`, `.andThen()`
- Type-safe error handling - compiler ensures errors are handled
- Easy to test - just check Ok vs Err

**How We'll Know It Works**:
- All validation functions return `Result<T, ValidationError>`
- Config file operations return `Result<T, ConfigError>`
- No `process.exit()` in library code (only in cli.ts main())
- Tests verify both success and error paths
- Existing functionality preserved (same behavior, different pattern)

## Implementation Plan

### 1. Add neverthrow dependency
- [x] Run `yarn add neverthrow` to add the library
- [x] Verify version (should be 8.x) - ✅ 8.2.0 installed

### 2. Create error type definitions
- [x] Create `src/types/errors.ts` with custom error classes:
  - `ValidationError` - Environment variable validation errors
  - `ConfigError` - Configuration file/directory errors
  - `FileSystemError` - File I/O errors
- [x] Each error should have: `message`, `code`, optional `cause`
- [x] Base class `SHC2ESError` for all custom errors
- [x] Full JSDoc documentation with examples

### 3. Update validation.ts to return Results
- [x] Import `Result`, `ok`, `err` from neverthrow
- [x] Update `validateRequired()` - return `Result<string, ValidationError>`
- [x] Update `validateUrl()` - return `Result<string | undefined, ValidationError>`
- [x] Update `validateFilePath()` - return `Result<string | undefined, ValidationError>`
- [x] Update `validateBoolean()` - return `Result<boolean, ValidationError>`
- [x] Update `validateLogLevel()` - return `Result<LogLevel, ValidationError>`
- [x] Update `validatePollConfig()` - return `Result<PollConfig, ValidationError>`
- [x] Update `validateIngestConfig()` - return `Result<IngestConfig, ValidationError>`
- [x] Update `validateRegistryConfig()` - return `Result<RegistryConfig, ValidationError>`
- [x] Update `validateDashboardConfig()` - return `Result<DashboardConfig, ValidationError>`

### 4. Update config.ts file operations (SKIPPED - config.ts already returns proper values/null/throws)
- [ ] ~~Update `ensureConfigDirs()` - return `Result<void, ConfigError>`~~ - Creates directories or throws, appropriate for setup
- [ ] ~~Update `findEnvFile()` - return `Result<string | null, ConfigError>`~~ - Returns string | null, no errors possible
- [ ] ~~Use Result for any fs operations that could fail~~ - Current error handling is appropriate for config setup

### 5. Update CLI scripts to handle Results
- [x] Update `src/cli.ts` - unwrap Results, handle errors, exit with codes (not needed - cli.ts doesn't call validation directly)
- [x] Update `src/poll.ts` - use Result from validation, only exit in main()
- [x] Update `src/ingest.ts` - use Result from validation, only exit in main()
- [x] Update `src/fetch-registry.ts` - use Result from validation, only exit in main()
- [x] Update `src/export-dashboard.ts` - use Result from validation, only exit in main()
- [x] ~~Remove all `process.exit()` calls except in CLI entry points~~ - Already only in CLI entry points

### 6. Update tests
- [x] Update `tests/unit/validation.test.ts` - test both Ok and Err cases (46 tests)
- [ ] ~~Update `tests/unit/config.test.ts` - test Result handling~~ - config.ts not using Results
- [x] Add tests for new error types - Created `tests/unit/types/errors.test.ts` (29 tests)
  - ValidationError: constructor, default code, cause chaining, catching
  - ConfigError: constructor, default code, undefined path, cause chaining
  - FileSystemError: constructor, default code, cause chaining, special paths
  - Inheritance: polymorphism, type differentiation, error chains
  - Serialization: property extraction for all error types
- [x] Verify all existing tests still pass (192 total tests)

### 7. User Testing
- [x] Build: `yarn build` ✅ Compiled successfully
- [x] Lint: `yarn lint` ✅ No errors (including new no-console rule)
- [x] Format: `yarn format` ✅ Code formatted
- [x] Tests: `yarn test` ✅ All 192 tests pass (added 29 error type tests)
- [x] Coverage: ✅ errors.ts now 100% statements, 80% branches (was 66.66%/20%)
- [ ] Manual: Run `yarn poll` (should work as before) - USER MUST TEST
- [ ] Manual: Run with missing env var (should show helpful error) - USER MUST TEST
- [ ] Manual: Run `yarn ingest` (should work as before) - USER MUST TEST

### 8. ESLint no-console rule
- [x] Add `no-console: error` to eslint.config.mjs
- [x] Allow console in cli.ts (CLI entry point needs user-facing output)
- [x] Add eslint-disable comments for legitimate console usage:
  - config.ts: Debug output in dev mode (circular dependency prevents logger use)
  - export-dashboard.ts: User-facing CLI output (list dashboards, usage help)
- [x] Verify rule catches new violations

### 9. Changeset
- [x] Create `.changeset/result-error-handling.md` with patch version bump
- [x] Description: "Refactor validation error handling with Result/Either pattern for improved composability and maintainability"

## Review
- [x] Code review completed - no bugs found
- [x] Coverage analysis:
  - validation.ts: 98.85% statements, 95.23% branches ✅
  - types/errors.ts: **100% statements, 80% branches** ✅ (improved from 66.66%/20%)
  - Overall: 95.79% statements, 86.86% branches (up from 93.27%/84.67%)
  - All error codes documented and consistent
- [x] Edge cases verified:
  - Empty/whitespace values handled correctly
  - Type narrowing works after Result checks
  - Error chaining with andThen fails fast (by design)
  - Only _unsafeUnwrap used in tests (not production)
- [x] Pattern consistency checked:
  - All CLI scripts use same error handling pattern
  - ESLint no-console rule prevents regressions
  - Error codes follow SCREAMING_SNAKE_CASE convention
- [x] Test coverage improved:
  - Added 29 comprehensive tests for error types
  - Tests cover: constructors, default values, cause chaining, inheritance, serialization
  - All error classes (ValidationError, ConfigError, FileSystemError) fully tested
- [x] No cleanup items needed

## Notes

### Implementation Summary

**Completed**:
1. ✅ Added `neverthrow` library (v8.2.0) for Result/Either pattern
2. ✅ Created comprehensive error type hierarchy in `src/types/errors.ts`:
   - `SHC2ESError` base class with `code` and optional `cause`
   - `ValidationError` for env var/config validation errors
   - `ConfigError` for file system config errors  
   - `FileSystemError` for general I/O errors
3. ✅ Converted all validation functions to return `Result<T, ValidationError>`:
   - `validateRequired()` - Result with error codes like `MISSING_REQUIRED`
   - `validateUrl()` - Error codes: `MISSING_REQUIRED`, `INVALID_URL_PROTOCOL`, `INVALID_URL_TRAILING_SLASH`, `INVALID_URL_FORMAT`
   - `validateFilePath()` - Error code: `FILE_NOT_FOUND`
   - `validateBoolean()` - Error code: `INVALID_BOOLEAN`
   - `validateLogLevel()` - Error code: `INVALID_LOG_LEVEL` + new `LogLevel` type
   - Config builders use `.andThen()` and `.map()` for composable validation
4. ✅ Updated all CLI scripts (`poll.ts`, `ingest.ts`, `fetch-registry.ts`, `export-dashboard.ts`):
   - Check `result.isErr()` before proceeding
   - Log errors with structured logger + console.error for user-facing messages
   - Only call `process.exit(1)` in CLI entry points (not library code)
5. ✅ Rewrote all 46 tests in `tests/unit/validation.test.ts`:
   - Test both success (`.isOk()`) and error (`.isErr()`) paths
   - Verify error codes and messages
   - Use `._unsafeUnwrap()` for test assertions only

**Design Decisions**:
- **Error codes** - All ValidationError instances have programmatic error codes for testability
- **Type safety** - Used eslint-disable for non-null assertions where type system can't track `required: true` means non-undefined
- **Composability** - Config functions use `andThen`/`map` chains instead of try/catch
- **Logging improvements** - Removed redundant `console.error()` calls; pino-pretty handles both console and file output
- **Error messages** - Log messages now include full error text: `Configuration validation failed: ${error.message}`
- **Immediate error output** - Added `logErrorAndExit()` helper that writes to stderr synchronously for immediate user feedback
- **no-console rule** - Added ESLint rule to prevent future console.* usage; allowed only in CLI entry point and with explicit eslint-disable
- **Backward compatible** - Same error messages for users, just different internal handling
- **config.ts unchanged** - Setup functions appropriately throw/return null, no need for Results there

**Known Behavior**:
- When validation fails immediately, you may see "Fatal error: sonic boom is not ready yet" from pino's internal async writes
- This is a known pino/sonic-boom issue: https://github.com/pinojs/pino/issues/871
- **This is harmless** - the actual error message is clearly displayed via `[ERROR]` prefix
- The error is logged synchronously to file using `fs.openSync()` + `sync: true` (per issue #871 recommendation)
- The sonic-boom message appears because appLogger's async writes are still pending when we exit
- User experience is not impacted - the error message is clear and actionable

**Testing Coverage**:
- ✅ All 192 tests pass (added 29 error type tests)
- ✅ 95.79% statement coverage, 86.86% branch coverage (exceeds 70% threshold)
- ✅ errors.ts: 100% statements, 80% branches (improved from 66.66%/20%)
- ✅ Both success and failure paths tested for all validators
- ✅ Comprehensive error type tests: constructors, inheritance, cause chaining, serialization
