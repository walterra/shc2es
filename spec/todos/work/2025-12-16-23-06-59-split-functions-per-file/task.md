# Split out functions into separate files, ideally one function per file

**Status:** In Progress  
**Created:** 2025-12-16 23:06:59  
**Started:** 2025-12-17 00:24:23  
**Agent PID:** 58485

## Description

Split large monolithic files into modular single-responsibility modules following SOLID principles. Primary focus: `src/ingest.ts` (804 lines) which currently handles config loading, TLS setup, registry management, ES setup, dashboard import, batch import, file watching, and CLI orchestration.

**Success criteria:**

1. Each module has a single clear responsibility
2. All 236 existing tests pass (zero regressions)
3. Test coverage remains ≥70%
4. No breaking changes to public CLI API
5. Code compiles with `yarn build` and passes `yarn lint`
6. All new modules comply with ESLint complexity rules (≤300 lines, ≤50 lines/function, complexity ≤10)

**Benefits:**

- Easier to test individual functions in isolation
- Clearer separation of concerns (pure transforms vs. side effects)
- Simpler to maintain and extend individual modules
- Better code discoverability for new contributors

## Implementation Plan

### Phase 0: Add ESLint rules to enforce modularity

- [x] Read current `eslint.config.mjs` configuration
- [x] Add recommended rules to prevent future violations:
  - `max-lines`: 300 lines per file (warn)
  - `max-lines-per-function`: 50 lines per function (warn)
  - `complexity`: cyclomatic complexity ≤10 (warn)
  - `max-depth`: nesting depth ≤3 (error)
  - `max-params`: function parameters ≤4 (error)
  - `max-nested-callbacks`: callback nesting ≤4 (error)
  - `max-statements`: statements per function ≤30 (warn)
- [x] Run `yarn lint` to identify current violations (baseline: 107 problems)
- [x] Document violations to fix during refactoring (see Notes section)

### Phase 1: Create ingest/ subdirectory structure

- [ ] Create `src/ingest/` directory
- [ ] Create `src/ingest/config.ts` - Config loading, TLS setup
  - Move: `getConfig()`, `buildTlsConfig()`, `createTlsFetch()`, `TlsConfig` interface
  - Export: `getIngestConfig()`, `createElasticsearchClient()`, `createKibanaFetch()`
- [ ] Create `src/ingest/registry.ts` - Device registry management
  - Move: `loadRegistry()`, `DeviceInfo` interface, registry map, enrichment logic
  - Export: `loadDeviceRegistry()`, `enrichEvent()`, `getDeviceInfo()`
- [ ] Create `src/ingest/utils.ts` - Pure utility functions
  - Move: `extractDateFromFilename()`, `getIndexName()`, `parseLine()`
  - Export all (pure functions, no side effects)
- [ ] Create `src/ingest/transform.ts` - Document transformation
  - Move: `transformDoc()`, `TransformedEvent` interface, `DeviceField` interface
  - Export: `transformEvent()`

### Phase 2: Extract ES setup and dashboard logic

- [ ] Create `src/ingest/setup.ts` - Elasticsearch index/pipeline setup
  - Move: `setup()` function, template/pipeline definitions
  - Export: `setupElasticsearch()`
- [ ] Create `src/ingest/dashboard.ts` - Kibana dashboard operations
  - Move: `importDashboard()`, `prefixSavedObjectIds()`, `DASHBOARDS_DIR`, Kibana types
  - Export: `importKibanaDashboard()`, `prefixDashboardIds()`

### Phase 3: Extract batch import logic

- [ ] Create `src/ingest/bulk-import.ts` - Batch file processing
  - Move: `bulkImportFile()`, `batchImport()`
  - Export: `importFile()`, `importFiles()`
- [ ] Update imports in moved files to use new module paths

### Phase 4: Extract file watching logic

- [ ] Create `src/ingest/watch.ts` - Real-time file watching/tailing
  - Move: `watchAndTail()`, `startFileWatcher()`, `startTailing()`, `indexSingleEvent()`
  - Export: `startWatchMode()`
- [ ] Update imports in moved files

### Phase 5: Create main entry point

- [ ] Create `src/ingest/main.ts` - CLI orchestration
  - Move: `main()` function from `src/ingest.ts`
  - Import and compose functions from other ingest/\* modules
  - Export: `main()`
- [ ] Update `src/cli.ts` to import from `src/ingest/main.ts`
- [ ] Delete old `src/ingest.ts` after verifying all code moved

### Phase 6: Testing and validation

- [ ] Run automated tests: `yarn test` (must pass all 236 tests)
- [ ] Verify test coverage: `yarn test:coverage` (must be ≥70%)
- [ ] Run linter: `yarn lint` (must pass, no new violations)
- [ ] Verify ESLint complexity rules: Check all src/ingest/\* files comply with max-lines, max-lines-per-function, complexity limits
- [ ] Run build: `yarn build` (must compile cleanly)
- [ ] User test: Run `yarn ingest --help` (verify CLI still works)
- [ ] User test: Run `yarn ingest --setup` with test ES instance (verify setup works)
- [ ] User test: Run `yarn ingest --pattern "events-*.ndjson"` (verify batch import works)
- [ ] User test: Run `yarn ingest --watch` (verify watch mode works)

## Review

[To be determined]

## Notes

### Phase 0: ESLint Baseline Violations (107 total: 20 errors, 87 warnings)

**Critical violations to fix (20 errors):**

- `src/ingest.ts`: 3 max-depth errors (lines 248, 251, 253 in transformDoc function)
- `src/transforms.ts`: 2 max-depth errors (lines 73, 86 in extractMetric function)
- `src/instrumentation.test.ts`: 15 max-nested-callbacks errors (test file)

**Primary refactoring targets (max-lines violations):**

- `src/ingest.ts`: 641 lines (target: ≤300) - **MAIN REFACTORING TARGET**
- `src/export-dashboard.ts`: 313 lines (target: ≤300)

**Function complexity violations to address:**

- `src/ingest.ts`:
  - `transformDoc()`: 61 lines, complexity 23 (target: ≤50 lines, ≤10 complexity)
  - `importDashboard()`: 66 lines (target: ≤50)
  - `setup()`: 78 lines (target: ≤50)
  - `bulkImportFile()`: 70 lines (target: ≤50)
- `src/export-dashboard.ts`:
  - `findDashboardByName()`: 63 lines (target: ≤50)
- `src/transforms.ts`:
  - `extractMetric()`: complexity 14 (target: ≤10)
  - `generateDocId()`: complexity 11 (target: ≤10)

**Other warnings:**

- 17 "remove adjective or be specific" JSDoc warnings (cosmetic, can fix separately)
- 14 test file function length warnings (acceptable in tests)

**Strategy:**

1. Split `src/ingest.ts` into modules will fix most violations (file size, function size)
2. Refactor `transformDoc()` and `extractMetric()` to reduce complexity/nesting
3. Address `src/export-dashboard.ts` if time permits (separate from this task's scope)
4. Test file violations are acceptable (tests often need long setup/assertion blocks)
