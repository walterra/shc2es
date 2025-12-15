# TODO

## High Priority: Coding Style Compliance

### Type Safety Improvements





### JSDoc Documentation

- **Add comprehensive JSDoc to all exported functions**
  - Missing JSDoc in: `ingest.ts`, `export-dashboard.ts`, `fetch-registry.ts`, `poll.ts`, `logger.ts` (partial), `cli.ts`
  - Required format:
    ````typescript
    /**
     * Brief description of what the function does (single line).
     *
     * Detailed explanation of behavior, side effects, and business logic.
     *
     * @param paramName - Description of parameter, including valid values and constraints
     * @param optionalParam - Optional parameter (indicate default value)
     * @returns Description of return value, including possible values and error states
     * @throws ErrorType - When and why exceptions are thrown
     *
     * @example
     * ```typescript
     * const result = functionName('example', { option: true });
     * ```
     */
    ````
  - Priority order: `validation.ts`, `config.ts`, `logger.ts`, `instrumentation.ts`, `ingest.ts`, `fetch-registry.ts`, `export-dashboard.ts`, `poll.ts`

### Function Length and Complexity

- **Extract long functions (>20 lines) into smaller units**
  - `src/export-dashboard.ts`: `exportDashboard()` (109 lines) - split into:
    - `fetchDashboardExport()` - API call
    - `parseDashboardExport()` - parse and validate NDJSON
    - `saveDashboardFile()` - file I/O with stripped metadata
  - `src/fetch-registry.ts`: `main()` (86 lines) - split into:
    - `fetchDevicesAndRooms()` - API calls
    - `buildRegistryData()` - data transformation
    - `saveRegistry()` - file I/O
  - `src/poll.ts`: `startPolling()` (103 lines) - split into:
    - `subscribeToEvents()` - subscription logic
    - `handlePollingLoop()` - recursive polling
    - `processEventBatch()` - event processing (already uses withSpan but can be extracted)
    - `handleTransientError()` - error retry logic
  - `src/ingest.ts`: `watchAndTail()` (82 lines) - split into:
    - `startFileWatcher()` - chokidar setup
    - `startTailing()` - Tail setup
    - `indexSingleEvent()` - event indexing

- **Refactor validation functions for better readability**
  - `src/validation.ts`: `validateUrl()` (54 lines), `validateIngestConfig()` (54 lines) - consider extracting:
    - URL validation rules into separate functions (`checkProtocol`, `checkTrailingSlash`)
    - Config builders into separate functions per config type

### Pure Functions and Immutability

- **Add `readonly` parameters where applicable**
  - All transformation functions should use `readonly` for input parameters
  - Files: `ingest.ts` (`transformDoc`, `extractMetric`, `generateDocId`), `validation.ts` (all validators), `instrumentation.ts`
  - Example: `function transformDoc(readonly doc: SmartHomeEvent): TransformedEvent`

- **Identify and mark pure functions with `@pure` JSDoc tag**
  - Candidates: `extractMetric`, `transformDoc`, `generateDocId`, `extractDateFromFilename`, `getIndexName`, `parseLine` (all in `ingest.ts`)
  - Add explicit documentation that functions have no side effects
  - Consider moving pure transformation logic to separate `transforms.ts` module

- **Replace mutation with immutable patterns**
  - `src/ingest.ts`: `transformDoc()` mutates `result` object - use object spread instead
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
  - `src/ingest.ts`: Validate Elasticsearch API responses
  - `src/export-dashboard.ts`: Validate Kibana API responses
  - Use Zod schemas to ensure API contracts are met before processing

### Error Handling

- **Custom error classes for domain errors**
  - Create `src/errors.ts` with hierarchy:
    - `SHC2ESError` (base)
    - `ConfigurationError` (validation, missing env vars)
    - `ControllerError` (BSH API errors)
    - `ElasticsearchError` (ES API errors)
    - `KibanaError` (Kibana API errors)
    - `FileSystemError` (file I/O errors)
  - All error classes should extend `Error` properly with `cause` support
  - Include error codes for programmatic handling

- **Replace `process.exit()` with proper error propagation**
  - Files: `poll.ts`, `ingest.ts`, `fetch-registry.ts`, `export-dashboard.ts`, `cli.ts`
  - CLI scripts should catch errors in `main()` and exit with appropriate code
  - Library code (validation, config) should throw/return errors, not exit

### Logging

- **Correlation IDs for request tracing**
  - Generate correlation ID at request/command start
  - Add to all log statements within request context
  - Use OpenTelemetry trace context when available
  - Files: All CLI scripts (`poll.ts`, `ingest.ts`, `fetch-registry.ts`, `export-dashboard.ts`)

- **Structured logging consistency**
  - Audit all log statements for proper structure
  - Ensure error objects are logged with full context
  - Use semantic field names consistently (e.g., `device.id` not `deviceId`)
  - Document logging conventions in `spec/LOGGING.md`

### Async/Await and Signal Handling

- **Add AbortController support to all async operations**
  - Files: `poll.ts` (long polling), `ingest.ts` (file watching, ES operations), `fetch-registry.ts` (API calls), `export-dashboard.ts` (Kibana API calls)
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

- **Increase test coverage to 70% branch coverage**
  - Current: 70% threshold (statements, functions, lines), 60% (branches)
  - Target: 70% branch coverage with fast-check property-based tests for edge cases
  - Priority: Add tests for `ingest.ts`, `fetch-registry.ts`, `export-dashboard.ts`

- **Property-based testing with fast-check**
  - Add `fast-check` dependency
  - Test validation functions with arbitrary inputs
  - Test transformation functions (e.g., `transformDoc`, `extractMetric`) with generated events
  - Test file path utilities with arbitrary paths

- **Integration tests with TestContainers**
  - Add TestContainers for Elasticsearch (official ES container)
  - Add TestContainers for Kibana (official Kibana container)
  - Test full ingestion pipeline: NDJSON → ES → query verification
  - Test dashboard export/import roundtrip

### SOLID Principles

- **Single Responsibility: Split large modules**
  - `src/ingest.ts` (509 lines) - split into:
    - `ingest/setup.ts` - Pipeline and template setup
    - `ingest/transform.ts` - Document transformation (pure functions)
    - `ingest/bulk-import.ts` - Batch import logic
    - `ingest/watch.ts` - File watching and tailing
    - `ingest/dashboard.ts` - Dashboard import logic
    - `ingest/main.ts` - CLI entry point
- **Dependency Injection for testability**
  - `src/logger.ts`: Make logger factory accept config object instead of reading env vars
  - `src/ingest.ts`: Accept ES client as parameter instead of creating internally
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
  - Add to: `poll.ts`, `ingest.ts` (watch mode)

### Code Formatting and Linting

- **ESLint: Enable additional strict rules**
  - Add to `eslint.config.mjs`:
    - `@typescript-eslint/no-explicit-any`: 'error'
    - `@typescript-eslint/no-unsafe-*` rules: 'error'
    - `@typescript-eslint/explicit-function-return-type`: 'error'
    - `@typescript-eslint/consistent-type-imports`: 'error'
  - Fix all violations before enforcing

- **Prettier: Update to match coding style**
  - Current: Default 2-space indent, unknown line width
  - Required: 2-space indent ✅, 100-char line width
  - Update `.prettierrc` or add to `package.json`

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
- Update: `ingest.ts`, `export-dashboard.ts`, `validation.ts`
- Allow more granular permissions for automation

### Logging (from existing TODO)

- **Logging Consistency Audit** - Already covered above in High Priority
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

## Notes

- **Semantic versioning**: All breaking changes (e.g., replacing process.exit with exceptions, changing config validation to use Zod) should be documented in changesets
- **Incremental approach**: Tackle high-priority items first, focusing on one module at a time to maintain stability
- **Testing first**: Write tests before refactoring to ensure behavior doesn't change
- **Coverage gate**: Don't merge PRs that decrease coverage percentage
