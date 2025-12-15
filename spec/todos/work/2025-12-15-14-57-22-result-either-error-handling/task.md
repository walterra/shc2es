# Result/Either Pattern for Error Handling

**Status:** In Progress  
**Created:** 2025-12-15-14-57-22  
**Started:** 2025-12-15-15:02:00  
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
- [ ] Import `Result`, `ok`, `err` from neverthrow
- [ ] Update `validateRequired()` - return `Result<string, ValidationError>`
- [ ] Update `validateUrl()` - return `Result<string | undefined, ValidationError>`
- [ ] Update `validateFilePath()` - return `Result<string | undefined, ValidationError>`
- [ ] Update `validateBoolean()` - return `Result<boolean, ValidationError>`
- [ ] Update `validateLogLevel()` - return `Result<LogLevel, ValidationError>`
- [ ] Update `validatePollConfig()` - return `Result<PollConfig, ValidationError>`
- [ ] Update `validateIngestConfig()` - return `Result<IngestConfig, ValidationError>`
- [ ] Update `validateRegistryConfig()` - return `Result<RegistryConfig, ValidationError>`
- [ ] Update `validateDashboardConfig()` - return `Result<DashboardConfig, ValidationError>`

### 4. Update config.ts file operations
- [ ] Update `ensureConfigDirs()` - return `Result<void, ConfigError>`
- [ ] Update `findEnvFile()` - return `Result<string | null, ConfigError>`
- [ ] Use Result for any fs operations that could fail

### 5. Update CLI scripts to handle Results
- [ ] Update `src/cli.ts` - unwrap Results, handle errors, exit with codes
- [ ] Update `src/poll.ts` - use Result from validation, only exit in main()
- [ ] Update `src/ingest.ts` - use Result from validation, only exit in main()
- [ ] Update `src/fetch-registry.ts` - use Result from validation, only exit in main()
- [ ] Update `src/export-dashboard.ts` - use Result from validation, only exit in main()
- [ ] Remove all `process.exit()` calls except in CLI entry points

### 6. Update tests
- [ ] Update `tests/unit/validation.test.ts` - test both Ok and Err cases
- [ ] Update `tests/unit/config.test.ts` - test Result handling
- [ ] Add tests for new error types
- [ ] Verify all existing tests still pass

### 7. User Testing
- [ ] Build: `yarn build`
- [ ] Lint: `yarn lint`
- [ ] Format: `yarn format`
- [ ] Tests: `yarn test` (all tests pass)
- [ ] Manual: Run `yarn poll` (should work as before)
- [ ] Manual: Run with missing env var (should show helpful error)
- [ ] Manual: Run `yarn ingest` (should work as before)

## Review
- [ ] Bug/cleanup items if found

## Notes
[Important findings]
