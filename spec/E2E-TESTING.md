# E2E Testing Guide

This document describes the end-to-end (E2E) testing infrastructure for shc2es.

## Overview

E2E tests validate the complete data flow from controller polling through Elasticsearch ingestion to Kibana dashboard setup. They use:

- **Mock Bosch Smart Home Controller** - HTTP server mimicking Controller II API
- **Real Elasticsearch** - TestContainers with official Docker images
- **Real Kibana** - TestContainers with official Docker images
- **Docker Bridge Networking** - Containers communicate via Docker network

## Test Suites

### 1. Poll Flow (`tests/e2e/poll.e2e.test.ts`)

**Tests:** 4 | **Duration:** ~0.3s | **Containers:** Mock controller only

Validates long polling from mock controller to NDJSON files:

- Mock controller connectivity
- Pairing flow
- Subscription and long polling
- Event writing to NDJSON

### 2. Registry Flow (`tests/e2e/fetch-registry.e2e.test.ts`)

**Tests:** 3 | **Duration:** ~0.2s | **Containers:** Mock controller only

Validates device/room registry fetching:

- Fetch devices from mock controller
- Fetch rooms from mock controller
- Build and save registry JSON with mappings

### 3. Ingest Flow (`tests/e2e/ingest.e2e.test.ts`)

**Tests:** 5 | **Duration:** ~13s | **Containers:** Elasticsearch

Validates NDJSON ingestion into Elasticsearch:

- Elasticsearch container startup
- NDJSON file creation
- Bulk document indexing
- Index mapping validation
- Query with filters

### 4. Dashboard Flow (`tests/e2e/dashboard.e2e.test.ts`)

**Tests:** 6 | **Duration:** ~27s | **Containers:** Elasticsearch + Kibana

Validates Kibana dashboard import/export:

- Both containers startup and networking
- Dashboard NDJSON file reading
- Dashboard import via Kibana API
- Dashboard existence verification
- Dashboard re-import with overwrite
- Dashboard export roundtrip

## Running Tests

### Run All E2E Tests

```bash
yarn test:e2e
```

**Expected:** 18 tests passing in ~40-45 seconds

### Run Specific Test Suite

```bash
yarn test:e2e tests/e2e/poll.e2e.test.ts
yarn test:e2e tests/e2e/fetch-registry.e2e.test.ts
yarn test:e2e tests/e2e/ingest.e2e.test.ts
yarn test:e2e tests/e2e/dashboard.e2e.test.ts
```

### Run All Tests (Unit + E2E)

```bash
yarn test:all
```

**Expected:** 236 tests passing (218 unit + 18 E2E)

### Run with Container Monitoring

```bash
# Terminal 1 - Monitor containers
docker stats

# Terminal 2 - Run tests
yarn test:e2e
```

## Architecture

### Port Management

All services use **ephemeral ports** to avoid conflicts with running services:

| Service         | Standard Port | Test Port            | Access                                                                  |
| --------------- | ------------- | -------------------- | ----------------------------------------------------------------------- |
| Mock Controller | N/A           | Random (e.g., 54320) | `http://localhost:54320`                                                |
| Elasticsearch   | 9200          | Random (e.g., 55012) | `http://localhost:55012` (host)<br>`http://172.17.0.2:9200` (container) |
| Kibana          | 5601          | Random (e.g., 56001) | `http://localhost:56001`                                                |

### Container Networking

Containers use Docker **bridge networking** for inter-container communication:

```
Host (tests) ─────────────────────> Elasticsearch (localhost:55012)
                                            │
                                            │ 172.17.0.2:9200
                                            │
Kibana Container ────────────────────────> Elasticsearch Container
(ELASTICSEARCH_HOSTS=http://172.17.0.2:9200)
```

**Why this matters:**

- `localhost` in a container refers to itself, not the host
- Kibana must use the Elasticsearch **container IP** to connect
- Tests use the **host-mapped port** to connect

### Test Isolation

Each test suite is isolated:

- **Temp directories** - Created per test, cleaned up after
- **Separate containers** - Each test suite starts fresh containers
- **Sequential execution** - `maxWorkers: 1` prevents resource contention
- **Force exit** - `forceExit: true` handles ES client open handles

## Configuration

### Jest Config (`jest.config.e2e.js`)

```javascript
{
  testMatch: ['**/tests/e2e/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.e2e.ts'],
  testTimeout: 180000, // 3 minutes
  maxWorkers: 1, // Sequential execution
  forceExit: true, // Force exit after tests
}
```

### Test Setup (`tests/setup.e2e.ts`)

- **Enables console logs** (unlike unit tests which suppress them)
- **Disables OpenTelemetry** - `OTEL_SDK_DISABLED=true`
- **Sets LOG_LEVEL=info** - Show container startup progress

### Container Configuration (`tests/utils/containers.ts`)

```typescript
{
  elasticsearchVersion: '9.2.2', // ARM64 support
  kibanaVersion: '9.2.2',
  heapSize: '768m', // Increased for ARM64
}
```

## Debugging

### View Container Logs

While tests are running:

```bash
# List containers
docker ps

# Follow Elasticsearch logs
docker logs -f <container-id>

# Follow Kibana logs
docker logs -f <container-id>

# Search for errors
docker logs <container-id> 2>&1 | grep -i error
```

### Check Container Resources

```bash
# CPU and memory usage
docker stats

# Inspect container
docker inspect <container-id>
```

### Enable Jest Debug Output

```bash
yarn test:e2e --verbose --detectOpenHandles
```

### Common Issues

#### 1. Docker Daemon Slow/Hung

**Symptoms:** Tests hang, Docker commands slow  
**Cause:** Too many stopped containers  
**Fix:**

```bash
docker container prune -f
docker system prune -f
```

#### 2. Container Networking Issues

**Symptoms:** `ECONNREFUSED` in Kibana logs  
**Cause:** Using host URL instead of container IP  
**Fix:** Verify `containerUrl` is used for inter-container communication

#### 3. Kibana Startup Timeout

**Symptoms:** `URL /api/status not accessible after 600000ms`  
**Cause:** Kibana taking longer than 10 minutes (normal on first run/ARM64)  
**Fix:** Wait patiently, or pull image first: `docker pull docker.elastic.co/kibana/kibana:9.2.2`

#### 4. Port Conflicts

**Symptoms:** Container fails to start  
**Cause:** Ephemeral port already in use (rare)  
**Fix:** Retry test, OS will assign different port

## CI Integration

### GitHub Actions (`.github/workflows/test.yml`)

E2E tests run in CI with:

- Docker available
- Sequential execution (`maxWorkers: 1`)
- Longer timeout (10 minutes)
- Container cleanup in `always()` step

```yaml
- name: Run E2E tests
  run: yarn test:e2e
  timeout-minutes: 10

- name: Cleanup containers
  if: always()
  run: docker ps -aq | xargs docker rm -f
```

## Performance

### Optimization Tips

1. **Pull images before tests:**

   ```bash
   docker pull docker.elastic.co/elasticsearch/elasticsearch:9.2.2
   docker pull docker.elastic.co/kibana/kibana:9.2.2
   ```

2. **Increase Docker resources:**
   - Memory: 4GB+ recommended
   - CPUs: 2+ recommended
   - Disk: Ensure space available

3. **Run tests in sequence:**
   - Don't run multiple E2E test suites in parallel
   - Let containers start/stop cleanly

### Expected Timings

| Environment           | All E2E Tests | Dashboard Only |
| --------------------- | ------------- | -------------- |
| ARM64 (Apple Silicon) | ~40-45s       | ~27s           |
| x86_64 (Intel)        | ~30-35s       | ~20s           |
| CI (GitHub Actions)   | ~60-90s       | ~40-50s        |

## Adding New Tests

### 1. Create Test File

```typescript
// tests/e2e/my-feature.e2e.test.ts
import { startElasticsearchContainer } from '../utils/containers';

describe('My Feature E2E', () => {
  let elasticsearch;

  beforeAll(async () => {
    elasticsearch = await startElasticsearchContainer();
  }, 180000);

  afterAll(async () => {
    await stopElasticsearchContainer(elasticsearch);
  });

  it('should do something', async () => {
    // Test implementation
  });
});
```

### 2. Use Test Helpers

```typescript
import { createTempDir, cleanupTempDir } from '../utils/test-helpers';

const tempDir = createTempDir('my-test-');
// ... use tempDir
cleanupTempDir(tempDir);
```

### 3. Add Console Logging

```typescript
console.log('[Test] Starting my test...');
console.log(`[Test] Value: ${value}`);
```

### 4. Run and Verify

```bash
yarn test:e2e tests/e2e/my-feature.e2e.test.ts
```

## Best Practices

1. **Use ephemeral ports** - Never hardcode ports
2. **Clean up resources** - Always use `afterAll` hooks
3. **Add timeouts** - Containers take time to start
4. **Log progress** - Help debug CI failures
5. **Test isolation** - Each test should be independent
6. **Verify cleanup** - Check `docker ps` after tests
7. **Handle errors gracefully** - Log error bodies for debugging
8. **Use FormData for uploads** - Kibana requires multipart form data
9. **Accept degraded status** - Kibana can be degraded but functional
10. **Force exit** - ES client leaves open handles

## Resources

- [TestContainers Documentation](https://node.testcontainers.org/)
- [Elasticsearch Docker Images](https://www.docker.elastic.co/)
- [Kibana Saved Objects API](https://www.elastic.co/guide/en/kibana/current/saved-objects-api.html)
- [Jest Configuration](https://jestjs.io/docs/configuration)
