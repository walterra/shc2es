# Real e2e integration tests

**Status:** Done  
**Created:** 2025-12-16-14-25-02  
**Started:** 2025-12-16 14:34:04  
**Completed:** 2025-12-16 16:05:35  
**Agent PID:** 58208

## Description

**What we're building:**

End-to-end integration tests that exercise the complete data flow from controller polling through Elasticsearch ingestion to Kibana dashboard setup. This requires:

1. **Mock Bosch Smart Home Controller** - HTTP server mimicking the Controller II API endpoints:
   - `/smarthome/clients` (pairing)
   - `/remote/json-rpc` (subscribe, long polling)
   - `/smarthome/devices` (registry)
   - Serves realistic test events from fixtures

2. **Real Elasticsearch & Kibana** - TestContainers-based infrastructure:
   - Official Elasticsearch container
   - Official Kibana container
   - Clean state per test suite
   - Proper lifecycle management

3. **E2E Test Suite** - Integration tests covering:
   - **Poll flow**: Mock controller → poll.ts → NDJSON files → verify events written
   - **Ingest flow**: NDJSON files → ingest.ts → Elasticsearch → verify documents indexed
   - **Dashboard flow**: ingest.ts --setup → Kibana → verify dashboard created
   - **Registry flow**: Mock controller → fetch-registry.ts → verify device/room metadata

**How we'll know it works:**

- ✅ Tests connect to mock controller and receive events via long polling
- ✅ Events are written as NDJSON to temp directories
- ✅ NDJSON files are ingested into containerized Elasticsearch
- ✅ Documents are queryable with correct mappings and enrichment
- ✅ Kibana dashboard is created and valid
- ✅ Device registry is fetched and stored correctly
- ✅ All CLI scripts (currently excluded from coverage) are tested end-to-end
- ✅ Tests run in CI without external dependencies

## Implementation Plan

### Phase 1: Dependencies & Infrastructure

- [x] **Add testcontainers dependencies** (`package.json`)
- [x] **Create mock Bosch controller server** (`tests/mocks/bosch-controller-server.ts`)
- [x] **Add controller server test fixtures** (`tests/fixtures/controller-devices.json`, `controller-rooms.json`)

### Phase 2: TestContainers Setup

- [x] **Create test helpers for containers** (`tests/utils/containers.ts`)
- [x] **Update jest.config.js for e2e tests**

### Phase 3: E2E Tests

- [x] **Poll flow e2e test** (`tests/e2e/poll.e2e.test.ts`)
- [x] **Registry flow e2e test** (`tests/e2e/fetch-registry.e2e.test.ts`)
- [x] **Ingest flow e2e test** (`tests/e2e/ingest.e2e.test.ts`)
- [x] **Dashboard flow e2e test** (`tests/e2e/dashboard.e2e.test.ts`)

### Phase 4: CI Integration

- [x] **Update GitHub Actions workflow** (`.github/workflows/ci.yml` - added separate `e2e` job)
- [x] **Add convenience scripts** (`package.json`: `test:e2e`, `test:unit`, `test:all`)

### Phase 5: Documentation

- [x] **Update testing documentation** (`tests/README.md`)
- [x] **Create E2E testing guide** (`spec/E2E-TESTING.md`)
- [x] **Update project description** (`spec/project-description.md`)

### Automated Tests

- [x] All e2e tests pass (`yarn test:e2e`) - 18/18 passing
- [x] Unit tests still pass (`yarn test:unit`)
- [x] Coverage thresholds maintained
- [x] Lint and format pass
- [x] Build succeeds

### User Tests

- [x] Run `yarn test:e2e` and verify all tests pass - ✅ 18/18
- [x] Run `yarn test:all` and verify both unit and e2e tests pass - ✅ 236/236 (218 unit + 18 E2E)
- [x] Verify tests clean up containers properly (check `docker ps` after tests) - ✅ Containers cleaned up
- [x] Verify formatting and linting pass - ✅ All checks pass

## Review
- [x] Bug/cleanup items if found - Cleaned up excessive console.logs (42 → 7)

## Notes

### Port & Resource Management
- **Port conflicts avoided**: All containers use ephemeral ports (0) to avoid conflicts with running services
  - Elasticsearch: Random port instead of 9200
  - Kibana: Random port instead of 5601  
  - Mock controller: Random port
- **ARM64 compatibility**: Updated to Elasticsearch/Kibana 9.2.2 for Apple Silicon support
- **Resource limits**: Increased heap from 512m to 768m for ARM64 to reduce GC pressure
- **Timeouts added**: ES client 30s request timeout, container stop 30s timeout with force removal

### Docker Daemon Issues Encountered
- **Issue**: Docker daemon hung with 818% CPU usage (8+ cores)
- **Root cause**: 27 stopped containers causing Docker daemon slowness/deadlock
- **Solution**: Cleaned up stopped containers with `docker container prune -f`
- **Prevention**: Added `forceExit: true` to Jest config, improved container cleanup

### Test Status
- **Poll E2E**: ✅ All tests passing (4/4) - Fast, no containers (~0.3s)
- **Registry E2E**: ✅ All tests passing (3/3) - Fast, no containers (~0.2s)
- **Ingest E2E**: ✅ All tests passing (5/5) - Elasticsearch container (~13s)
- **Dashboard E2E**: ✅ All tests passing (6/6) - ES + Kibana containers (~27s)

### Debug Improvements
- **Console logging added**: Shows container startup, test progress, cleanup steps
- **Jest forceExit**: Prevents hanging on open handles from ES client connections
- **Separate E2E setup**: Created `tests/setup.e2e.ts` to enable console logs (unit tests suppress them)
- **Cleanup**: Reduced console logs from 42 to 7 (keeping only essential startup/error logs)

### Kibana API Fixes
- **Container networking**: Fixed `ECONNREFUSED` by using Docker bridge network and container IPs
- **Import API**: Changed from raw NDJSON to FormData/multipart upload (HTTP 415 → 200)
- **Export API**: Removed duplicate `type` field when using `objects` array (HTTP 400 → 200)

### CI Integration
- **Added separate E2E job** to GitHub Actions (runs in parallel with unit tests)
- **Pre-pulls Docker images** for faster execution in CI
- **15-minute timeout** for E2E job (unit tests use default 10 minutes)
- **Always cleanup** containers even if tests fail
- **Runs on Node.js 22.x only** (E2E tests validate service integration, not Node.js compatibility)
