# Structured logging consistency - Audit and standardize log field names
**Status:** Done
**Created:** 2025-12-16-13-31-05
**Started:** 2025-12-16-13-38-28
**Agent PID:** 58208

## Description

**What we're building:**

A comprehensive logging standards document (`spec/LOGGING.md`) that defines consistent field naming conventions aligned with Elastic Common Schema (ECS) AND human-readable log messages, plus code updates to enforce these standards across all log statements.

**Current state issues:**

1. **Poor human readability**: Messages like "Devices fetched" lack context - should be "Fetched 42 devices from controller"
2. **Inconsistent error logging**: Uses `err` instead of ECS-compliant `error.message`
3. **Flat field names**: Uses camelCase (`deviceId`, `filePath`) instead of ECS dotted notation (`device.id`, `file.path`)
4. **No correlation IDs**: Missing trace context for request tracing
5. **Mixed naming conventions**: Some fields are simple (`count`), others camelCase (`deviceCount`)
6. **No semantic conventions**: API endpoints use arbitrary names (`kibanaNode`, `esNode`) instead of ECS fields

**Logging best practices we're adopting:**

1. **Self-contained messages**: Log message string should tell the complete story even without parsing JSON
   - ❌ Bad: `log.info({ count: 5 }, 'Devices fetched')`
   - ✅ Good: `log.info({ 'device.count': 5 }, 'Fetched 5 devices from controller')`

2. **ECS field alignment**: Use dotted notation matching Elastic Common Schema
   - `device.id`, `file.path`, `error.message`, `url.full`, `event.type`, `trace.id`

3. **Complete error context**: Serialize errors with all available information
   - `error.message`, `error.stack_trace`, `error.type`, `error.code`

4. **Correlation support**: Include trace IDs for distributed tracing (OpenTelemetry integration)

**How we'll know it works:**

- Log messages are readable and informative without needing to parse JSON fields
- All log statements use consistent ECS-aligned field names
- Error objects are serialized with full context
- Documentation clearly defines field naming conventions with examples
- Tests verify logger output contains expected ECS fields and readable messages
- No violations found in code audit

## Implementation Plan

### Phase 1: Documentation & Standards
- [x] Create `spec/LOGGING.md` with ECS field mapping, message guidelines, examples
- [x] Add error serialization helper to `src/logger.ts` for consistent error logging

### Phase 2: Update Log Statements (79 total)
- [x] Update `src/poll.ts` (19 statements) - file paths, error messages, event fields, readable messages
- [x] Update `src/ingest.ts` (35 statements) - file paths, error messages, counts, URLs, readable messages
- [x] Update `src/fetch-registry.ts` (8 statements) - counts, IDs, file paths, readable messages
- [x] Update `src/export-dashboard.ts` (17 statements) - URLs, IDs, file paths, readable messages

### Phase 3: Testing
- [x] Add tests for error serialization helper in `src/logger.test.ts`
- [x] Update existing tests for new ECS field names
- [x] Verify human-readable messages in test output
- [x] Run full test suite: `yarn test` - All 218 tests passing

### Phase 4: Validation
- [x] Lint and format: `yarn lint && yarn format` - All checks passing
- [x] Build: `yarn build` - TypeScript compilation successful
- [x] Manual review of log output samples - Verified all 79 log statements updated
- [x] User test: Review example logs from each script - User confirmed "looks great"

### Phase 5: Documentation Update
- [x] Update `spec/project-description.md` to reference LOGGING.md standards - Added ECS logging details to Observability section

## Review
- [ ] Bug/cleanup items if found

## Notes

### Implementation Summary

**Files Created:**
- `spec/LOGGING.md` - Comprehensive logging standards documentation with ECS field mapping, examples, and migration guide

**Files Modified:**
- `src/logger.ts` - Added `serializeError()` helper function for ECS-compliant error serialization, updated JSDoc examples
- `src/poll.ts` - Updated 19 log statements with ECS fields and human-readable messages
- `src/ingest.ts` - Updated 35 log statements with ECS fields and human-readable messages
- `src/fetch-registry.ts` - Updated 8 log statements with ECS fields and human-readable messages
- `src/export-dashboard.ts` - Updated 17 log statements with ECS fields and human-readable messages
- `src/logger.test.ts` - Added 9 comprehensive tests for `serializeError()` function
- `src/poll.test.ts` - Updated 4 test expectations to match new log format

**Key Changes:**
1. All error logging now uses `serializeError()` for consistent ECS-compliant error fields
2. Field names changed from camelCase to ECS dotted notation:
   - `err` → `error.message`, `error.stack_trace`, `error.type`, `error.code`
   - `deviceId` → `device.id`, `deviceCount` → `device.count`
   - `filePath` → `file.path`, `eventType` → `event.type`
   - `esNode`/`kibanaNode` → `url.full`
   - Generic `count` → specific counts like `event.count`, `device.count`
3. All log messages enhanced to be self-contained and human-readable
4. Template literals fixed to convert numbers explicitly using `String()` to satisfy ESLint rules

**Test Results:**
- All 218 tests passing
- Lint: ✓ No errors
- Format: ✓ All files formatted
- Build: ✓ TypeScript compilation successful

### Migration Impact

**Breaking Changes:** None - log format changes are non-breaking for the application
**Backward Compatibility:** Old log parsing scripts may need updates to read new field names
**Documentation:** LOGGING.md provides complete field mapping reference for migration
