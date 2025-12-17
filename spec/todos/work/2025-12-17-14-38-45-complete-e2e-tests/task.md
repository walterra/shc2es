# Complete E2E test implementation (finish dependency injection work)

**Status:** Refining
**Created:** 2025-12-17-14-38-45
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

### Phase 1: poll.ts - Full Dependency Injection

- [ ] Refactor `main()` to accept optional config object (src/poll.ts:225-280)
  - Add `PollConfig` interface with all dependencies (bshHost, clientName, clientId, password, dataDir, certsDir)
  - Support both env vars (default CLI) and injected config (tests)
  - Keep backward compatibility with existing CLI usage
- [ ] Refactor `main()` to accept optional AbortSignal (src/poll.ts:225-280)
  - Add `signal?: AbortSignal` parameter to main()
  - Pass signal through to polling loop
  - Abort subscription/polling when signal fires
- [ ] Extract bridge creation into injectable factory (src/poll.ts:199-210)
  - Accept optional `bridgeFactory` parameter in main()
  - Allow tests to inject mock bridge
- [ ] Write E2E test: poll with mock controller → verify NDJSON files (tests/e2e/poll.e2e.test.ts:92-136)
  - Call actual main() function with injected config
  - Use AbortSignal to stop polling after N events
  - Verify events written to correct NDJSON files
  - Verify file format and content matches expected schema

### Phase 2: ingest/main.ts - Full Dependency Injection

- [ ] Refactor `main()` to accept optional config object (src/ingest/main.ts:26-69)
  - Add `IngestConfig` interface with all dependencies (esNode, esUser, esPassword, indexPrefix, kibanaNode, dataDir, etc.)
  - Support both env vars and injected config
- [ ] Refactor `main()` to accept optional AbortSignal (src/ingest/main.ts:26-69)
  - Add `signal?: AbortSignal` parameter
  - Pass to watch mode, bulk import operations
  - Cancel in-flight ES operations on abort
- [ ] Extract ES client creation into injectable factory (src/ingest/config.ts:71-98)
  - Accept optional `esClientFactory` in main()
  - Allow tests to inject pre-configured client
- [ ] Write E2E test: ingest batch mode → verify ES documents (tests/e2e/ingest.e2e.test.ts:137-end)
  - Create test NDJSON files with fixture data
  - Call actual main() with batch import args
  - Verify documents indexed in ES with correct transformations
  - Verify metrics extracted, device/room enrichment applied
- [ ] Write E2E test: ingest watch mode → verify real-time indexing (tests/e2e/ingest.e2e.test.ts:137-end)
  - Call main() with --watch mode
  - Write new events to NDJSON while watching
  - Verify events indexed in real-time
  - Use AbortSignal to stop watch mode

### Phase 3: fetch-registry.ts - Full Dependency Injection

- [ ] Refactor `main()` to accept optional config object (src/fetch-registry.ts:164-200)
  - Add `RegistryConfig` interface with dependencies (bshHost, certsDir, dataDir)
  - Support env vars and injected config
- [ ] Extract BSHB client creation into injectable factory (src/fetch-registry.ts:164-200)
  - Accept optional `bshbClientFactory` in main()
  - Allow tests to inject mock client
- [ ] Write E2E test: fetch registry from mock controller → verify JSON file (tests/e2e/fetch-registry.e2e.test.ts:79-137)
  - Call actual main() with mock controller URL
  - Verify device-registry.json created with correct structure
  - Verify device-room mappings preserved
  - Verify metadata fields (fetchedAt, device types, room icons)

### Phase 4: export-dashboard.ts - Full Dependency Injection

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
