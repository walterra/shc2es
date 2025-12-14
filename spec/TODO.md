# TODO

## Elasticsearch/Kibana Integration

### ID Prefixing Enhancement
- Support for custom ID prefix in dashboard saved objects is implemented but needs documentation
  - Add `ES_INDEX_PREFIX` usage examples in README.md
  - Document multi-deployment scenarios (e.g., dev/prod on same Kibana instance)

### Dashboard Export Script
- Implement `yarn dashboard:export` CLI command
  - Add to src/export-dashboard.ts (currently exists but may need updates)
  - Validate against spec/KIBANA.md requirements
  - Add error handling for missing KIBANA_NODE, authentication failures
  - Test with actual Kibana instance

### Import Options Enhancement
- Add support for `createNewCopies` and `compatibilityMode` parameters in dashboard import
  - Currently only `overwrite=true` is used
  - Make these configurable via CLI flags: `--create-new-copies`, `--compatibility-mode`
  - Update importDashboard() function in src/ingest.ts

### Watch Mode Improvements
- Test watch mode handles daily file rotation correctly
  - Spec mentions "Handle daily file rotation (new file each day)"
  - Current implementation watches only today's file
  - Need to handle midnight rollover: stop tailing old file, start tailing new file
  - Add date change detection in watchAndTail()

### Error Recovery
- Add retry logic for transient ES failures during live tail
  - Currently logs error but doesn't retry
  - Implement exponential backoff for index operations
  - Track failed documents for manual review

### Data Streams Migration
- Research Elasticsearch data streams for automatic rollover
  - Spec mentions "Future Considerations: Use ES data streams with ILM"
  - Evaluate benefits over date-based indices
  - Would eliminate manual daily file logic

### Kibana Dashboard Creation
- Create initial smart-home dashboard if dashboards/smart-home.ndjson is missing
  - Current behavior: silently skips import if file missing
  - Consider creating basic dashboard template programmatically
  - Or provide better user guidance on creating first dashboard

## Testing

### Integration Tests
- Add integration tests for ingest.ts
  - Mock Elasticsearch client
  - Test document transformation (extractMetric, transformDoc, generateDocId)
  - Test file parsing edge cases (malformed JSON, pino leading comma)
  - Test registry enrichment logic

### Dashboard Import Tests
- Add tests for prefixSavedObjectIds() function
  - Verify all ID types are prefixed correctly
  - Verify references are updated
  - Test edge cases: missing references, malformed NDJSON

### E2E Tests
- End-to-end test with real Elasticsearch (using testcontainers?)
  - Full setup → ingest → query workflow
  - Verify indexed documents match expectations
  - Test watch mode with simulated file appends

## Documentation

### README Updates
- Add troubleshooting section
  - Common import errors from spec/KIBANA.md
  - TLS certificate issues
  - Missing references error
  - Memory usage for large imports

### Configuration Guide
- Comprehensive .env configuration examples
  - Development (self-signed certs)
  - Production (API keys, proper CA certs)
  - Multi-environment setups

### Architecture Diagram
- Add visual diagram to README or spec
  - Data flow: Controller → poll → NDJSON → ingest → Elasticsearch → Kibana
  - Show all components and their interactions

## Code Quality

### Type Safety
- Strengthen TypeScript types for saved objects
  - Currently using `unknown` and `any` in several places
  - Define proper interfaces for Kibana saved object API responses

### Logging Consistency
- Audit all log statements for proper levels (debug/info/warn/error/fatal)
  - Some info logs might be better as debug
  - Ensure errors include stack traces where relevant

### Configuration Validation
- Add comprehensive validation for environment variables
  - Check URL formats for ES_NODE, KIBANA_NODE
  - Validate paths exist for ES_CA_CERT
  - Provide helpful error messages for missing/invalid config
