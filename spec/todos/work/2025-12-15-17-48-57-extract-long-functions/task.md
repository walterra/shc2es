# Extract long functions (>20 lines) into smaller units
**Status:** In Progress
**Created:** 2025-12-15-17-48-57
**Started:** 2025-12-15-17-51-00
**Agent PID:** 2325

## Description

### Goal
Refactor large functions (>20 lines) in CLI scripts into smaller, focused units to improve readability, testability, and maintainability. This follows the Single Responsibility Principle (SRP) and makes the codebase easier to understand and modify.

### Target Functions
1. **src/export-dashboard.ts**: `exportDashboard()` (109 lines) - split into smaller helper functions
2. **src/fetch-registry.ts**: `main()` (86 lines) - extract API calls, transformation, and I/O
3. **src/poll.ts**: `startPolling()` (103 lines) - extract subscription, polling loop, and error handling  
4. **src/ingest.ts**: `watchAndTail()` (82 lines) - extract watcher setup, tail setup, and event indexing

### Success Criteria
- ✅ All functions are ≤50 lines (target ~20-30 lines for most, with clear single responsibility)
- ✅ Each extracted function has a single, well-defined purpose with descriptive JSDoc
- ✅ Existing tests pass without modification (behavior unchanged)
- ✅ Code is more readable with clear separation of concerns
- ✅ Lint and build pass successfully
- ✅ Test coverage maintained or improved

## Implementation Plan

### 1. src/export-dashboard.ts - Extract exportDashboard() (lines 130-238)
- [x] Extract `fetchDashboardExport(dashboardId)` - API call and response validation
- [x] Extract `parseDashboardExport(ndjson)` - Parse NDJSON and group by type
- [x] Extract `saveDashboardFile(ndjson, outputName)` - Strip metadata and write file
- [x] Update `exportDashboard()` to orchestrate the three functions
- [x] Verify: Run `yarn build && yarn lint`
- [x] Verify: Existing tests pass `yarn test tests/integration/dashboard.test.ts`

### 2. src/fetch-registry.ts - Extract main() (lines 44-129)
- [x] Extract `fetchDevicesAndRooms(client)` - API calls returning devices and rooms
- [x] Extract `buildRegistryData(devices, rooms)` - Transform to registry format
- [x] Extract `saveRegistry(registry)` - Write to file with logging
- [x] Update `main()` to orchestrate the three functions  
- [x] Verify: Run `yarn build && yarn lint`
- [ ] Verify: Manual test with mock data or user testing

### 3. src/poll.ts - Extract startPolling() (lines 66-169)
- [x] Extract `subscribeToEvents(client, bshb)` - Subscription logic
- [x] Extract `handlePollingLoop(client, subscriptionId, bshb)` - Recursive polling
- [x] Extract `handleTransientError(error, callback)` - Error classification and retry
- [x] Update `startPolling()` to orchestrate subscription and polling
- [x] Verify: Run `yarn build && yarn lint`
- [x] Verify: Existing tests pass `yarn test tests/unit/poll.test.ts`

### 4. src/ingest.ts - Extract watchAndTail() (lines 503-585)
- [x] Extract `startFileWatcher(filePath, indexName)` - Chokidar setup
- [x] Extract `startTailing(filePath, indexName)` - Tail setup and event handling
- [x] Extract `indexSingleEvent(doc, indexName)` - Single event indexing
- [x] Update `watchAndTail()` to orchestrate watcher and tail
- [x] Verify: Run `yarn build && yarn lint`  
- [x] Verify: Existing tests pass `yarn test tests/unit/ingest-transforms.test.ts`

### 5. Final validation
- [x] Run full test suite: `yarn test` - 204 tests passed
- [x] Run coverage check: `yarn test:coverage` - 94.69% statements, 86.86% branches
- [x] Run lint: `yarn lint` - No errors
- [x] Run format check: `yarn format` - Formatted
- [x] Verify build: `yarn build` - Success

### 6. User testing
- [ ] User confirms: `yarn poll` works (user runs this, not agent)
- [ ] User confirms: `yarn ingest` works with sample data
- [ ] User confirms: `yarn registry` works  
- [ ] User confirms: `yarn dashboard` works

## Review
- [ ] Bug/cleanup items if found

## Notes

### Summary of Changes

**src/export-dashboard.ts** (109 lines → 3 functions + orchestrator)
- Extracted `fetchDashboardExport()` - API call logic (33 lines)
- Extracted `parseDashboardExport()` - NDJSON parsing and validation (39 lines)  
- Extracted `saveDashboardFile()` - File I/O with metadata stripping (18 lines)
- Updated `exportDashboard()` - Now 13 lines (orchestrates the 3 functions)

**src/fetch-registry.ts** (86 lines → 3 functions + orchestrator)
- Extracted `fetchDevicesAndRooms()` - API calls (24 lines)
- Extracted `buildRegistryData()` - Data transformation (45 lines)
- Extracted `saveRegistry()` - File I/O (5 lines)
- Updated `main()` - Now 13 lines (orchestrates the 3 functions)
- Added proper type import: `BshcClient` from bosch-smart-home-bridge

**src/poll.ts** (103 lines → 3 functions + orchestrator)
- Extracted `handleTransientError()` - Error handling with retry (7 lines)
- Extracted `handlePollingLoop()` - Recursive polling logic (20 lines)
- Extracted `subscribeToEvents()` - Subscription management (32 lines)
- Updated `startPolling()` - Now 6 lines (orchestrates subscription)

**src/ingest.ts** (82 lines → 3 functions + orchestrator)
- Extracted `indexSingleEvent()` - Single event indexing (24 lines)
- Extracted `startTailing()` - Tail setup and event handling (20 lines)
- Extracted `startFileWatcher()` - Chokidar configuration (35 lines)
- Updated `watchAndTail()` - Now 21 lines (orchestrates watcher/tail)
- Added proper type import: `FSWatcher` from chokidar

### Key Improvements
- ✅ All functions now ≤50 lines (most are 20-30 lines)
- ✅ Each function has a single, clear responsibility
- ✅ Added comprehensive JSDoc comments for all extracted functions
- ✅ Maintained proper TypeScript types (no `any` shortcuts)
- ✅ All 204 tests still pass
- ✅ Coverage maintained at 94.69% statements, 86.86% branches
- ✅ No lint errors, build successful

### Bug Fixes
- **Fixed config initialization in poll.ts**: Changed from `require.main === module` check to `NODE_ENV === "test"` check. The original check broke when running via `ts-node src/cli.ts poll` because `require.main` would be `cli.ts` instead of `poll.ts`, leaving `config` undefined and causing the script to exit immediately. Now properly detects test environment vs. runtime execution.
