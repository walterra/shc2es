# TODO

- GitHub found 1 high severity vulnerability on the default branch (Dependabot alert)

## High Priority: Coding Style Compliance

### Function Length and Complexity

- address linting warnings

- **Refactor validation functions for better readability**
  - `src/validation.ts`: `validateUrl()` (54 lines), `validateIngestConfig()` (54 lines) - consider extracting:
    - URL validation rules into separate functions (`checkProtocol`, `checkTrailingSlash`)
    - Config builders into separate functions per config type

### Pure Functions and Immutability

- **Add `readonly` parameters where applicable**
  - All transformation functions should use `readonly` for input parameters
  - Files: `ingest/transform.ts` (`transformEvent`, `extractMetric`), `transforms.ts` (`generateDocId`), `validation.ts` (all validators), `instrumentation.ts`
  - Example: `function transformEvent(readonly doc: SmartHomeEvent): TransformedEvent`

- **Identify and mark pure functions with `@pure` JSDoc tag**
  - Candidates: `extractMetric`, `transformEvent` (in `ingest/transform.ts`), `generateDocId` (in `transforms.ts`), `extractDateFromFilename`, `getIndexName`, `parseLine` (in `ingest/utils.ts`)
  - Add explicit documentation that functions have no side effects
  - ✅ Pure transformation logic already separated into `transforms.ts` module

- **Replace mutation with immutable patterns**
  - `src/ingest/transform.ts`: `transformEvent()` mutates `result` object - use object spread instead
  - `src/export-dashboard.ts`: `stripSensitiveMetadata()` uses `delete` - use object rest/spread
  - `src/fetch-registry.ts`: Registry building mutates `registry` object - use builder pattern

### Input Validation at Boundaries

- **Add Zod schemas for configuration validation**
  - Replace `validation.ts` functions with Zod schemas for:
    - Environment variable parsing with coercion
    - Descriptive error messages with path information
    - Type inference from schemas (no duplicate interfaces)
  - Files: `validation.ts` (complete rewrite), `config.ts` (use schemas)
  - Benefits: Runtime validation + TypeScript types from single source

- **Validate external API responses**
  - `src/fetch-registry.ts`: Validate Bosch API responses (`BshDevice`, `BshRoom`)
  - `src/ingest/bulk-import.ts`, `src/ingest/setup.ts`: Validate Elasticsearch API responses
  - `src/export-dashboard.ts`: Validate Kibana API responses
  - Use Zod schemas to ensure API contracts are met before processing

### Error Handling

- **Custom error classes for domain errors** (PARTIALLY DONE - ✅ base structure exists in `src/types/errors.ts`)
  - ✅ `SHC2ESError` (base) - exists
  - ✅ `ValidationError` (validation, missing env vars) - exists
  - ✅ `ConfigError` - exists
  - ✅ `FileSystemError` - exists
  - ❌ TODO: Add remaining domain-specific errors:
    - `ControllerError` (BSH API errors)
    - `ElasticsearchError` (ES API errors)
    - `KibanaError` (Kibana API errors)

### Logging

- **Correlation IDs for request tracing**
  - Generate correlation ID at request/command start
  - Add to all log statements within request context
  - Use OpenTelemetry trace context when available
  - Files: All CLI scripts (`poll.ts`, `ingest/main.ts`, `fetch-registry.ts`, `export-dashboard.ts`)

### Async/Await and Signal Handling

- **Add AbortController support to all async operations**
  - Files: `poll.ts` (long polling), `ingest/main.ts` and `ingest/watch.ts` (file watching, ES operations), `fetch-registry.ts` (API calls), `export-dashboard.ts` (Kibana API calls)
  - Allow graceful cancellation of in-flight operations
  - Wire up to SIGINT/SIGTERM handlers

- **Graceful shutdown hooks**
  - Create `src/shutdown.ts` with cleanup hook registry
  - Register cleanup functions for:
    - Closing file watchers/tails
    - Flushing logs
    - Closing ES/Kibana clients
    - Completing in-flight spans (OpenTelemetry)
  - Ensure all resources are cleaned up before exit

### Testing

- **E2E tests don't test application code** (PARTIALLY FIXED - ✅ testability improved)
  - Current `tests/e2e/` are infrastructure tests (mock controller, ES client), not application tests
  - **What they test**: Mock HTTP endpoints work, ES bulk operations succeed, TestContainers infrastructure
  - **What they DON'T test**:
    - `poll.ts` connecting to controller and writing NDJSON files
    - `ingest/main.ts` reading NDJSON and calling ES APIs
    - `fetch-registry.ts` fetching and saving device/room registry
    - `export-dashboard.ts` importing/exporting dashboards
  - **Progress made (2025-12-17):**
    - ✅ **Exit callback injection** - All `main()` functions now accept mockable `exit: (code: number) => void` parameter
    - ✅ **No process.exit() in library code** - Exit behavior is fully testable
    - ✅ **Tests can call main()** - No process termination during test execution
  - **Remaining work:**
    - ❌ Accept config/clients as parameters (full dependency injection)
    - ❌ Support graceful shutdown via AbortSignal
    - ❌ Write actual E2E tests that exercise full CLI flows
  - **Alternative**: Rename `tests/e2e/` → `tests/infrastructure/` to be honest about what's tested

### SOLID Principles

- **Dependency Injection for testability** (PARTIALLY DONE - ✅ exit callback pattern implemented)
  - ✅ **Exit callback injection** - All CLI scripts accept `exit: (code: number) => void` parameter (2025-12-17)
  - ❌ TODO: Inject remaining dependencies for full testability:
    - `src/logger.ts`: Make logger factory accept config object instead of reading env vars
    - `src/ingest/main.ts`: Accept ES client as parameter instead of creating internally
    - `src/fetch-registry.ts`: Accept BSHB client as parameter
    - `src/export-dashboard.ts`: Accept fetch function as parameter (easier to mock)
    - Create factory functions in CLI scripts that wire dependencies

### OpenTelemetry Best Practices

- **Reduce withSpan usage in hot paths**
  - Current: `withSpan` used in polling loop event processing (per-event)
  - Impact: High overhead for frequent operations, OTel queue can fill up
  - Solution: Only span high-level operations (batch processing, API calls), rely on auto-instrumentation for HTTP

- **Add span events for milestones**
  - Use `span.addEvent()` for significant events within long-running spans
  - Examples: "subscription_successful", "polling_started", "events_batch_processed"
  - Add to: `poll.ts`, `ingest/watch.ts` (watch mode)

## Medium Priority: Features and Enhancements

### Configuration Management

- **Environment variable precedence documentation**
  - Document order: CLI flags > env vars > .env file > defaults
  - Create `spec/CONFIGURATION.md` with all variables and examples

- **Config file validation on startup**
  - Use Zod schemas to validate entire config before starting
  - Print friendly error messages with suggestions
  - Show config summary in debug mode (with sensitive values masked)

### API Key Authentication (from existing TODO)

- Add support for Elasticsearch API keys as an alternative to basic auth
- Update: `ingest/config.ts`, `export-dashboard.ts`, `validation.ts`
- Allow more granular permissions for automation

### Logging (from existing TODO)

- **ECS Alignment** - Align field names with [Elastic Common Schema](https://www.elastic.co/guide/en/ecs/current/index.html)

## Low Priority: Documentation and Polish

### Documentation

- **SOLID Principles Guide** - Create `spec/ARCHITECTURE.md` documenting design decisions and SOLID application
- **Testing Guide Update** - Update `tests/README.md` with property-based testing examples
- **Kibana Setup Guide** (from existing TODO) - Add to `spec/KIBANA-SETUP.md`

### OpenTelemetry (from existing TODO)

- **Testing Infrastructure** - Add `@elastic/mockotlpserver` for OTel integration tests
- **Performance Tuning Documentation** - Document production batch processing settings
- **Docker Healthchecks** - Add healthcheck to `docker-compose.otel.yml`

### Misc

- evaluate vitest vs jest

## Notes

- **Semantic versioning**: All breaking changes (e.g., changing config validation to use Zod) should be documented in changesets
- **Incremental approach**: Tackle high-priority items first, focusing on one module at a time to maintain stability
- **Testing first**: Write tests before refactoring to ensure behavior doesn't change
- **Coverage gate**: Don't merge PRs that decrease coverage percentage

## Completed Items (2025-12-17)

- ✅ **Replace process.exit() with proper error propagation** - Implemented exit callback injection pattern for full testability (see `.changeset/testable-exit-callbacks.md`)
