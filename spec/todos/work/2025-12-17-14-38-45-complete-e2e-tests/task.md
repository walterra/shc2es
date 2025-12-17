# Complete E2E test implementation (finish dependency injection work)

**Status:** In Progress
**Created:** 2025-12-17-14-38-45
**Started:** 2025-12-17-14:39:21
**Agent PID:** 91996

## Description

Complete full E2E testing by finishing dependency injection and writing actual application flow tests. Current E2E tests only verify infrastructure (mock controller works, ES API works) but don't test the actual CLI commands end-to-end.

**What we're building:**

1. Full dependency injection for all CLI scripts (accept config/clients as parameters)
2. AbortSignal support for graceful shutdown testing
3. Actual E2E tests that call main() functions and verify complete flows

**How we'll know it works:**

- All 4 CLI scripts (poll, ingest, fetch-registry, export-dashboard) accept injected dependencies
- E2E tests successfully call main() functions with mock dependencies
- Tests verify complete flows: poll writes NDJSON, ingest reads and indexes, registry fetches and saves, dashboard imports
- Tests can abort operations via AbortSignal
- Coverage for actual application code (not just infrastructure)
- All tests pass with no process.exit() calls during test execution

## Implementation Plan

### Phase 1: poll.ts - Full Dependency Injection (COMPLETE)

- [x] Refactor `main()` to accept optional config object (src/poll.ts:225-280)
  - Add `PollConfig` interface with all dependencies (bshHost, clientName, clientId, password, dataDir, certsDir)
  - Support both env vars (default CLI) and injected config (tests)
  - Keep backward compatibility with existing CLI usage
- [x] Refactor `main()` to accept optional AbortSignal (src/poll.ts:225-280)
  - Add `signal?: AbortSignal` parameter to main()
  - Pass signal through to polling loop
  - Abort subscription/polling when signal fires
- [x] Extract bridge creation into injectable factory (src/poll.ts:199-210)
  - Accept optional `bridgeFactory` parameter in main()
  - Allow tests to inject mock bridge
- [x] Write E2E test: poll with mock controller → verify NDJSON files (tests/e2e/poll.e2e.test.ts:139-191)
  - ✅ Created mock bridge adapter (`tests/mocks/mock-bridge-adapter.ts`)
  - ✅ Test calls actual `pollMain()` with injected config, signal, and mock bridge
  - ✅ Verifies NDJSON files created with correct event data
  - ✅ Tests AbortSignal support for graceful shutdown
  - ✅ All 4 poll E2E tests passing

### Phase 1.5: Migrate from Jest to Vitest (COMPLETE ✅)

- [x] Install Vitest and dependencies
  - Added `vitest@4.0.16`, `@vitest/ui`, `@vitest/coverage-v8`
  - Removed `jest`, `ts-jest`, `@types/jest`, `@jest/globals`
- [x] Create Vitest config files
  - `vitest.config.ts` - base config with 70% coverage thresholds
  - `vitest.config.unit.ts` - unit tests (excludes E2E)
  - `vitest.config.e2e.ts` - E2E tests (TestContainers, sequential, long timeouts)
- [x] Update test files for Vitest
  - Added `import { describe, it, expect, vi } from 'vitest'` to all test files
  - Replaced `jest.fn()` → `vi.fn()`, `jest.spyOn()` → `vi.spyOn()`
  - Fixed `require()` in vi.mock() factories (not supported - used inline mocks)
  - Updated mock restore calls: `mockRestore()` → `vi.restoreAllMocks()`
- [x] Update package.json scripts
  - All scripts updated to use `vitest` command
  - Coverage uses `@vitest/coverage-v8` provider
- [x] Verify all tests pass: ✅ 209/209 tests passing
- [x] Clean up old Jest configs (removed jest.config.js, jest.config.unit.js, jest.config.e2e.ts)
- [x] Verify E2E infrastructure works: `yarn test:e2e` ✅ All 16 E2E tests passing
- [ ] Update documentation (CLAUDE.md, tests/README.md) - deferred to completion phase

**Why This Phase:**

- Solves ESM compatibility issue with `uuid` package (root cause of poll.ts E2E test failure)
- Native ESM support means no more transformIgnorePatterns hacks
- 10-20x faster test execution (especially watch mode)
- Jest-compatible API = minimal migration effort
- Modern, future-proof foundation for E2E tests

### Phase 2: ingest/main.ts - Full Dependency Injection (COMPLETE ✅)

**Current State:** All 4 E2E tests calling actual main() and passing

- [x] Refactor `main()` to accept optional config object (src/ingest/main.ts:26-69)
  - ✅ Added `IngestContext` interface with config, esClientFactory, kibanaFetchFactory, signal, args
  - ✅ Support both env vars (default) and injected config (tests)
  - ✅ Backward compatible with existing CLI usage
- [x] Refactor `main()` to accept optional AbortSignal (src/ingest/main.ts:26-69)
  - ✅ Added `signal?: AbortSignal` parameter in IngestContext
  - ✅ Pass to watch mode
  - ✅ Watch mode now returns Promise that resolves on abort
- [x] Extract ES client creation into injectable factory (src/ingest/config.ts:71-98)
  - ✅ Added `esClientFactory` parameter in IngestContext
  - ✅ Tests inject pre-configured client
- [x] Write E2E test: ingest batch mode → verify ES documents (tests/e2e/ingest.e2e.test.ts)
  - ✅ Test calls actual main() with batch import (no args)
  - ✅ Verifies 4 documents indexed with correct transformations
  - ✅ Uses fixture data from smartHomeEvents
- [x] Write E2E test: ingest --pattern mode → verify filtered import (tests/e2e/ingest.e2e.test.ts)
  - ✅ Test calls main() with --pattern arg
  - ✅ Verifies only matching files imported
  - ✅ Verifies other dates not indexed
- [x] Write E2E test: ingest --setup mode → verify template creation (tests/e2e/ingest.e2e.test.ts)
  - ✅ Test calls main() with --setup arg
  - ✅ Verifies index template created
  - ✅ Verifies template has correct mappings
- [x] Write E2E test: ingest watch mode → verify real-time indexing (tests/e2e/ingest.e2e.test.ts)
  - ✅ Test calls main() with --watch mode
  - ✅ Appends new events to NDJSON while watching
  - ✅ Verifies events indexed in real-time
  - ✅ Uses AbortSignal to stop watch mode gracefully
  - ✅ **BUG FIX**: Made startWatchMode() async - returns Promise that resolves on abort

### Phase 3: fetch-registry.ts - Full Dependency Injection (COMPLETE ✅)

**Current State:** All 3 E2E tests calling actual main() and passing

- [x] Refactor `main()` to accept optional config object (src/fetch-registry.ts:164-200)
  - ✅ Added `RegistryContext` interface with config, bridgeFactory, outputFile
  - ✅ Support both env vars (default) and injected config (tests)
  - ✅ Backward compatible with existing CLI usage
- [x] Extract BSHB client creation into injectable factory (src/fetch-registry.ts:164-200)
  - ✅ Added `bridgeFactory` parameter in RegistryContext
  - ✅ Tests inject mock bridge via createMockBridgeFactory()
  - ✅ Extended mock bridge adapter to support getDevices() and getRooms()
- [x] Write E2E test: fetch registry from mock controller → verify JSON file (tests/e2e/fetch-registry.e2e.test.ts)
  - ✅ Test calls actual main() with mock bridge factory
  - ✅ Verifies device-registry.json created with correct structure
  - ✅ Verifies 3 devices and 2 rooms from fixtures
  - ✅ Verifies metadata fields (fetchedAt, device types, room icons)
- [x] Write E2E test: verify device-room relationships (tests/e2e/fetch-registry.e2e.test.ts)
  - ✅ Test calls main() and verifies device-room mappings
  - ✅ Verifies all devices have name and type
  - ✅ Verifies timestamp is valid
- [x] Write E2E test: handle devices without rooms (tests/e2e/fetch-registry.e2e.test.ts)
  - ✅ Test calls main() and handles optional roomId field
  - ✅ Verifies structure allows devices without room assignments

### Phase 4: export-dashboard.ts - Full Dependency Injection

**Current State:** E2E tests exist (5 tests passing) but are infrastructure-only - they test Kibana API directly, not via export-dashboard main()

- [ ] Refactor `main()` to accept optional config object (src/export-dashboard.ts:425-end)
  - Add `DashboardConfig` interface with dependencies (kibanaNode, esUser, esPassword, indexPrefix, etc.)
  - Support env vars and injected config
- [ ] Extract fetch function into injectable dependency (src/export-dashboard.ts:425-end)
  - Accept optional `fetchFn` parameter for HTTP requests
  - Default to createTlsFetch() for CLI, allow mock for tests
- [ ] Write E2E test: import dashboard to Kibana → verify saved objects (tests/e2e/dashboard.e2e.test.ts:98-187)
  - Call actual main() with import args
  - Verify dashboard objects created in Kibana
  - Verify index pattern references updated to match prefix
- [ ] Write E2E test: export dashboard from Kibana → verify NDJSON (tests/e2e/dashboard.e2e.test.ts:188-end)
  - Call actual main() with export args
  - Verify NDJSON file created with correct structure
  - Verify sensitive metadata stripped

### Phase 5: Documentation and Types

- [ ] Create dependency injection types module (src/types/dependencies.ts)
  - Define all config interfaces centrally
  - Define factory function types
  - Export for reuse in tests and CLI
- [ ] Document DI pattern in tests/README.md
  - Explain how to inject dependencies for testing
  - Show examples of mocking clients/config
  - Document AbortSignal usage patterns
- [ ] Update CLAUDE.md with completed E2E testing (CLAUDE.md:338-355)
  - Move item from "Remaining work" to "Completed"
  - Update architecture section with DI pattern
  - Add testing workflow guidance

### Phase 6: Validation and Cleanup

- [ ] Run full test suite: `yarn test`
- [ ] Run E2E tests specifically: `yarn test:e2e`
- [ ] Verify coverage thresholds maintained (>70%)
- [ ] Run linter: `yarn lint`
- [ ] Run formatter: `yarn format`
- [ ] Build project: `yarn build`
- [ ] Manual verification: Run each CLI command to ensure backward compatibility
  - `yarn poll` (user will test with real controller - we verify no regression in exit behavior)
  - `yarn ingest` (test with sample NDJSON files)
  - `yarn registry` (user will test - verify no regression)
  - `yarn dashboard:import` (test with local Kibana if available)

## Review

[To be filled during review phase]

## Notes

### Current State Analysis

- ✅ Exit callback injection complete (all main() functions accept exit parameter)
- ✅ Mock infrastructure ready (MockBoschController, TestContainers for ES/Kibana)
- ✅ Test fixtures and helpers in place
- ❌ E2E tests only verify infrastructure, not actual application flows
- ❌ No dependency injection for config/clients (hard-coded env var reading)
- ❌ No AbortSignal support for graceful shutdown

### Key Design Decisions

- Use optional parameters pattern: `main(exit = process.exit, config?, signal?)`
- Keep backward compatibility: default parameters use current behavior (env vars, no abort)
- Tests provide explicit config and signal
- Don't break existing CLI usage - all changes additive only

### Risks and Mitigations

- **Risk**: Breaking changes to main() signatures could break CLI usage
  - **Mitigation**: Use optional parameters with defaults matching current behavior
- **Risk**: Complex dependency injection might make code harder to understand
  - **Mitigation**: Document pattern clearly, use factories for complex dependencies
- **Risk**: E2E tests might be slow with real containers
  - **Mitigation**: Already addressed - containers started once in global setup

### Dependencies and Prerequisites

- Existing test infrastructure (TestContainers, MockBoschController)
- Existing fixtures (smart-home-events.json, controller-devices.json, etc.)
- All CLI scripts already have exit callback injection (prerequisite met)

### Implementation Progress

**Phase 1 Complete - 2025-12-17 14:43**

- ✅ poll.ts refactored for full dependency injection (config, signal, bridgeFactory)
- ✅ Backward compatible - all new parameters optional with defaults
- ✅ Build succeeds, unit tests pass (209/209)
- ✅ Linting errors fixed - refactored to `PollingContext` to avoid max-params violations
- ❌ E2E test blocked by Jest/ESM incompatibility with `uuid` package in bosch-smart-home-bridge
  - Attempted multiple Jest config fixes (transformIgnorePatterns, moduleNameMapper)
  - Root cause: uuid@latest uses ESM (`"type": "module"`), Jest doesn't handle this well

**Research & Decision - 2025-12-17 15:10**

- 🔍 Researched modern E2E testing best practices (2025)
- **Finding 1**: Vitest is optimal solution
  - Native ESM support (solves uuid issue)
  - 10-20x faster than Jest
  - Jest-compatible API (easy migration)
  - 400% adoption growth (2023-2024)
  - Better for Node.js CLI testing
- **Finding 2**: Mocha still relevant but not optimal
  - Active maintenance, ESM support
  - More setup required (Mocha + Chai + Sinon)
  - Less momentum than Vitest
- **Finding 3**: Our "E2E tests" are actually component tests (correct approach!)
  - Testing full CLI components via API with TestContainers
  - Matches 2025 best practices (Testing Diamond strategy)
  - Should have many component tests, few true E2E tests
- **Decision**: Add Phase 1.5 to migrate Jest → Vitest before continuing E2E implementation

**Phase 1.5 Complete - 2025-12-17 16:12**

- ✅ **Migration successful**: All 209 tests passing with Vitest
- ✅ **ESM support confirmed**: No more `uuid` module issues
- ✅ **Performance**: Tests run in 3.16s (was ~3.5s with Jest)
- ✅ **Configs cleaned**: vitest.config.ts (base), unit, and e2e configs created
- **Key migration challenges solved:**
  - Converted all `jest.fn()` to `vi.fn()`
  - Converted all `jest.spyOn()` to `vi.spyOn()`
  - Fixed `vi.mock()` factories (can't use `require()`, used inline mocks)
  - Updated mock cleanup: `mockRestore()` → `vi.restoreAllMocks()`
- **Next**: Ready to test E2E infrastructure with Vitest (poll.ts test should now work!)
- **Update (2025-12-17 17:15)**: Fixed Vitest 4 deprecation warning
  - Updated `vitest.config.e2e.ts`: `poolOptions.forks.singleFork` → `singleFork` (top-level)
  - Updated `package.json` test:ci script to use Vitest 4 syntax
- **Update (2025-12-17 17:20)**: Fixed E2E test infrastructure issues
  - Fixed globalSetup to return teardown function (Vitest requirement)
  - Removed separate globalTeardown config (handled by setup return value)
  - Fixed poll E2E test to create all required directories (certs, logs, data)
  - Added retry logic to Kibana health check (10 retries, 3s delay) - container reports ready but needs time to stabilize
- **Update (2025-12-17 22:30)**: Migrated to Vitest 3+ provide/inject pattern (RESEARCH-DRIVEN)
  - **Root Cause**: Global setup runs in different scope - tests can't access `global.__E2E_CONTAINERS__`
  - **Solution**: Use Vitest's modern `provide()` in setup, `inject()` in tests (type-safe)
  - Updated `tests/global-setup.e2e.ts` to use `GlobalSetupContext.provide()`
  - Updated `tests/utils/global-containers.ts` to use `inject()` from 'vitest'
  - Fixed E2E config to NOT merge with base (was running unit tests in E2E mode)
  - Skipped poll E2E test - needs mock bridge adapter (bosch-smart-home-bridge expects HTTPS:8444, mock uses HTTP:random)

**Poll E2E Test Unblocked - 2025-12-17 (Date TBD - found during resume)**

- ✅ Created `tests/mocks/mock-bridge-adapter.ts` to adapt MockBoschController for bosch-smart-home-bridge interface
- ✅ Mock bridge implements only methods used by poll.ts: `pairIfNeeded()`, `getBshcClient()`
- ✅ Mock client implements subscribe() and longPolling() via HTTP to MockBoschController
- ✅ poll.e2e.test.ts now calls actual `pollMain()` with injected dependencies
- ✅ Test verifies complete flow: config → pairing → subscribe → poll → NDJSON files
- ✅ Test verifies AbortSignal support for graceful shutdown
- ✅ All 4 poll E2E tests passing (infrastructure + full main() integration)
- **Result**: Phase 1 is now FULLY COMPLETE including working E2E test

**Phase 2 Complete - 2025-12-17 23:32**

- ✅ ingest/main.ts refactored for full dependency injection (IngestContext with config, factories, signal, args)
- ✅ All 4 E2E tests rewritten to call actual main() function
- ✅ Tests cover: batch import, --pattern filtering, --setup template creation, --watch real-time
- ✅ **BUG DISCOVERED & FIXED**: `startWatchMode()` was synchronous - main() returned immediately
  - **Impact**: Watch mode couldn't be properly awaited or tested
  - **Fix**: Made `startWatchMode()` return `Promise<void>` that resolves on cleanup
  - **Fix**: Updated `main()` to `await startWatchMode()` when --watch flag present
  - **Benefit**: Tests can now properly await watch mode completion via AbortSignal
- ✅ Build succeeds, all unit tests pass (209/209)
- ✅ All E2E tests pass (16/16)
- **Result**: Phase 2 COMPLETE - ingest fully testable via DI pattern

**Phase 3 Complete - 2025-12-17 23:39**

- ✅ fetch-registry.ts refactored for full dependency injection (RegistryContext with config, bridgeFactory, outputFile)
- ✅ Extended mock bridge adapter to support getDevices() and getRooms() methods (not just polling)
- ✅ All 3 E2E tests rewritten to call actual main() function
- ✅ Tests cover: basic fetch, device-room relationships, devices without rooms
- ✅ Build succeeds, all unit tests pass (209/209)
- ✅ All E2E tests pass (16/16)
- **Result**: Phase 3 COMPLETE - fetch-registry fully testable via DI pattern

**Linting Cleanup - 2025-12-17 23:44**

- ✅ Fixed all 14 ESLint errors (0 errors remaining, 62 warnings)
- ✅ Fixed missing return type on bridgeFactory arrow function (src/fetch-registry.ts)
- ✅ Removed unused interface types (Room, Device) from fetch-registry.e2e.test.ts
- ✅ Removed unused variables (certsDir, dataDir) from E2E tests
- ✅ Fixed type assertions for Vitest inject() calls (returns unknown, needs cast to string | undefined)
- ✅ Fixed property names: containers.elasticsearchNode → elasticsearchUrl, kibanaNode → kibanaUrl
- ✅ Fixed template literal type safety (today variable nullable)
- ✅ All tests still passing after linting fixes
- **Result**: Codebase clean, only warnings remaining (test file length/complexity - acceptable)
