# TODO

## Elasticsearch/Kibana Integration

- Dashboard Export Script - Implement yarn dashboard:export CLI command, add to src/export-dashboard.ts (currently exists but may need updates), validate against spec/KIBANA.md requirements, add error handling for missing KIBANA_NODE and authentication failures, test with actual Kibana instance

- Import Options Enhancement - Add support for createNewCopies and compatibilityMode parameters in dashboard import. Currently only overwrite=true is used. Make these configurable via CLI flags (--create-new-copies, --compatibility-mode) and update importDashboard() function in src/ingest.ts

- Watch Mode File Rotation - Test watch mode handles daily file rotation correctly. Spec mentions "Handle daily file rotation (new file each day)" but current implementation watches only today's file. Need to handle midnight rollover: stop tailing old file, start tailing new file. Add date change detection in watchAndTail()

- Error Recovery for Live Tail - Add retry logic for transient ES failures during live tail. Currently logs error but doesn't retry. Implement exponential backoff for index operations and track failed documents for manual review

- Data Streams Migration Research - Research Elasticsearch data streams for automatic rollover. Spec mentions "Future Considerations: Use ES data streams with ILM". Evaluate benefits over date-based indices as it would eliminate manual daily file logic

- Kibana Dashboard Creation - Create initial smart-home dashboard if dashboards/smart-home.ndjson is missing. Current behavior: silently skips import if file missing. Consider creating basic dashboard template programmatically or provide better user guidance on creating first dashboard

## Testing

- Integration Tests for Ingest - Add integration tests for ingest.ts with mocked Elasticsearch client. Test document transformation (extractMetric, transformDoc, generateDocId), file parsing edge cases (malformed JSON, pino leading comma), and registry enrichment logic

- Dashboard Import Tests - Add tests for prefixSavedObjectIds() function. Verify all ID types are prefixed correctly, references are updated, and test edge cases (missing references, malformed NDJSON)

- E2E Tests with Real Elasticsearch - End-to-end test with real Elasticsearch using testcontainers. Cover full setup → ingest → query workflow, verify indexed documents match expectations, test watch mode with simulated file appends

## Documentation

- README Troubleshooting Section - Add troubleshooting section covering common import errors from spec/KIBANA.md, TLS certificate issues, missing references error, and memory usage for large imports

- Configuration Guide - Add comprehensive .env configuration examples for development (self-signed certs), production (API keys, proper CA certs), and multi-environment setups

- Architecture Diagram - Add visual diagram to README or spec showing data flow: Controller → poll → NDJSON → ingest → Elasticsearch → Kibana. Show all components and their interactions

## Code Quality

- Type Safety for Saved Objects - Strengthen TypeScript types for saved objects. Currently using unknown and any in several places. Define proper interfaces for Kibana saved object API responses

- Logging Consistency Audit - Audit all log statements for proper levels (debug/info/warn/error/fatal). Some info logs might be better as debug. Ensure errors include stack traces where relevant

- Configuration Validation - Add comprehensive validation for environment variables. Check URL formats for ES_NODE and KIBANA_NODE, validate paths exist for ES_CA_CERT, provide helpful error messages for missing/invalid config
