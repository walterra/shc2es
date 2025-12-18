# Refactor Context Injection - Handle .env configs in cli.ts

**Status:** Done
**Created:** 2025-12-18 09:17:21
**Started:** 2025-12-18 09:21:30
**Agent PID:** 91996

## Description

Currently, the application has an inconsistent dependency injection pattern:

- `cli.ts` loads `.env` files via `loadEnv()`, which modifies `process.env`
- Individual scripts (`poll.ts`, `ingest/main.ts`, `fetch-registry.ts`, `export-dashboard.ts`) read from `process.env` via validation functions
- For testability, we've added optional parameters (`injectedConfig`, `IngestContext`) to bypass env var reading

**Goal:** Establish a consistent, testable pattern where:

1. `cli.ts` loads, validates, and parses all configuration from `.env` files
2. Configuration is passed explicitly to scripts via their `main()` functions
3. Scripts no longer read from `process.env` directly
4. Tests inject configuration the same way production code does

**Success Criteria:**

- All scripts receive configuration via dependency injection from `cli.ts`
- No scripts read directly from `process.env` (except `cli.ts`)
- Tests use the same injection mechanism as production code
- All existing tests pass
- Configuration validation happens once in `cli.ts`, not in each script

## Industry Best Practices (2025)

Based on web research, modern TypeScript/Node.js applications follow these patterns:

### Constructor/Function Injection (Pure DI)

- **Most recommended approach** - No frameworks needed, explicit dependencies
- Pass dependencies as function parameters or class constructor arguments
- "Program to an interface, not an implementation"
- **Benefits:** Zero overhead, type-safe, testable, no magic decorators

### Avoid Temporal Coupling

- Don't use property injection (setting dependencies after instantiation)
- All dependencies should be required at construction time
- Forces explicit dependency graphs

### Context Objects for Parameter Explosion

- When functions need many dependencies, group them in a context object
- Example: `IngestContext` with `config`, `esClientFactory`, `kibanaFetchFactory`
- **Already partially implemented** in `ingest/main.ts`

### Factory Functions for Client Creation

- Inject factory functions instead of concrete clients
- Allows tests to inject mocks without stubbing libraries
- Example: `bridgeFactory` in `poll.ts` (already implemented)

### Configuration as a Dependency

- Configuration should be injected, not read from globals
- Validate configuration once at application entry point
- Pass validated config down to all modules

## Implementation Plan

- [x] **Phase 1: Create unified config types**
  - Create `src/types/config.ts` with all configuration interfaces
  - Consolidate `PollConfig`, `RegistryConfig`, `IngestConfig` types
  - Add `AppConfig` type that combines all script configs
  - Update `validation.ts` to re-export types from centralized location

- [x] **Phase 2: Centralize config loading in cli.ts**
  - Move all `validateXxxConfig()` calls to `cli.ts`
  - Validate configuration based on command (switch statement)
  - Parse `.env` and validate ALL configuration at startup
  - Pass validated config to each script's `main()` function

- [x] **Phase 3: Update poll.ts**
  - Remove `validatePollConfig()` call from `main()`
  - Accept `config: PollConfig` as required second parameter
  - Update `cli.ts` to pass `pollConfig` when calling `poll.main()`
  - Update imports to use `types/config.ts`
  - Fixed TypeScript compilation errors in validation.ts and ingest/config.ts

- [x] **Phase 4: Update fetch-registry.ts**
  - Remove `validateRegistryConfig()` call from `main()`
  - Make `RegistryContext.config` required (not `Partial<RegistryConfig>`)
  - Update `cli.ts` to pass `registryConfig` via RegistryContext
  - Update imports to use `types/config.ts`

- [x] **Phase 5: Update export-dashboard.ts**
  - Remove `validateDashboardConfig()` call from `main()`
  - Make `DashboardContext.config` required (not `Partial<DashboardConfig>`)
  - Update `cli.ts` to pass `dashboardConfig` via DashboardContext
  - Update imports to use `types/config.ts`

- [x] **Phase 6: Update ingest/main.ts**
  - Remove `getIngestConfig()` call from `main()`
  - Make `IngestContext.config` required (not `Partial<IngestConfig>`)
  - Update `cli.ts` to pass `ingestConfig` via IngestContext
  - Update imports to use `types/config.ts`

- [x] **Phase 7: Remove env var reading from validation.ts**
  - SKIPPED: validation functions can stay as-is for now
  - They're only called from cli.ts (the entry point)
  - Individual scripts no longer read from process.env directly (goal achieved)

- [x] **Phase 8: Update all tests**
  - Fixed E2E tests in `dashboard.e2e.test.ts` to pass config via DashboardContext
  - Verified poll.e2e.test.ts, ingest.e2e.test.ts, fetch-registry.e2e.test.ts already passing config correctly
  - All unit tests pass: `yarn test` ✓
  - All E2E tests pass: `yarn test:e2e` ✓

- [x] **Phase 9: Update documentation**
  - Updated `CLAUDE.md` with new configuration flow section
  - Documented dependency injection pattern: `.env` → `cli.ts` → scripts
  - Added `types/config.ts` to architecture file structure
  - Documented that scripts never read from `process.env` directly

- [x] **Phase 10: Code quality checks**
  - Fixed ESLint errors in `cli.ts` (floating promise, unbound method)
  - Fixed ESLint error in `fetch-registry.ts` (unused parameter)
  - `yarn lint` ✓ (0 errors, 65 warnings - acceptable)
  - `yarn format` ✓ (no changes needed)
  - `yarn build` ✓ (compilation successful)
  - `yarn test` ✓ (209 tests passing)
  - `yarn test:e2e` ✓ (15 tests passing)
  - `yarn test:all` ✓ (224 tests passing)

## Review

- [x] Check for any remaining `process.env` reads outside `cli.ts`
  - ✅ Only validation.ts reads from process.env (called by cli.ts)
  - ✅ All scripts receive config via injection
- [x] Verify all scripts follow same injection pattern
  - ✅ All scripts accept config as required parameter
  - ✅ Context objects (IngestContext, RegistryContext, DashboardContext) require config
- [x] Ensure error messages guide users to `.env` configuration
  - ✅ Validation errors include file path hints
  - ✅ cli.ts shows "Configuration error:" prefix with validation message
- [x] Check that config validation errors happen at startup, not during operation
  - ✅ All validation happens in cli.ts before calling main()
  - ✅ Scripts assume config is valid when received
- [x] Create changeset entry
  - ✅ Created `.changeset/refactor-context-injection.md` (patch level)

## Notes

### Implementation Findings

**Pattern Established:**

- Configuration flows: `.env` → `cli.ts` (validate) → `main()` (inject) → script logic
- Scripts never read from `process.env` directly
- All validation happens once at application entry point
- Tests inject configuration the same way production code does

**Key Changes:**

1. Created `src/types/config.ts` with centralized interfaces
2. Moved all config validation calls to `cli.ts` switch statement
3. Updated all scripts to receive config via required parameters
4. Fixed E2E tests to pass config explicitly
5. Updated `CLAUDE.md` with configuration flow documentation

**Technical Details:**

- `poll.main()` is synchronous (returns `void`) - used `void` operator for ESLint
- `IngestContext`, `RegistryContext`, `DashboardContext` now require config (not `Partial<>`)
- Exit callback pattern maintained for testability
- Factory functions (bridgeFactory, esClientFactory) still injectable for mocks

**Test Results:**

- All 209 unit tests passing
- All 15 E2E tests passing
- Zero ESLint errors (65 warnings acceptable)
- Build successful
- No formatting changes needed
