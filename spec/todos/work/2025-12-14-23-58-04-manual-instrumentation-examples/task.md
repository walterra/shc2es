# Manual Instrumentation Examples

**Status:** Refining  
**Created:** 2025-12-14-23-58-04  
**Agent PID:** 2325

## Description

We're adding manual OpenTelemetry instrumentation examples to provide deeper observability beyond the existing auto-instrumentation from `@elastic/opentelemetry-node`. The goal is to create custom spans that track latency for key business logic operations **across all scripts**:

1. **poll.ts** - Event processing per device/event type
2. **ingest.ts** - Document transformation, bulk indexing, registry enrichment
3. **fetch-registry.ts** - API calls to fetch devices/rooms, registry building
4. **export-dashboard.ts** - Dashboard search, export, metadata stripping

**Success criteria:**
- Custom spans appear in APM UI with proper attributes (device ID, event type, operation names, etc.)
- Spans are properly nested within auto-instrumented traces
- Example code is well-documented for users to extend to their own logic
- No performance degradation in normal operations
- Documentation added to spec/OPEN-TELEMETRY.md with usage examples and semantic conventions

## Implementation Plan

### Code Changes

- [ ] Create instrumentation utility module (src/instrumentation.ts)
  - Export tracer instance from @opentelemetry/api
  - Provide withSpan() helper for sync/async operations
  - Document span attributes and semantic conventions

- [ ] Add spans to poll.ts (lines 52-92)
  - Wrap subscription setup: operation="subscribe"
  - Wrap event processing: operation="process_event"
  - Attributes: event.type, device.id, event.count

- [ ] Add spans to ingest.ts (multiple locations)
  - transformDoc() (lines 179-226): operation="transform_document"
  - bulkImportFile() (lines 343-403): operation="bulk_import_file"
  - loadRegistry() (lines 116-134): operation="load_registry"
  - Attributes: doc.type, device.id, index.name, file.path, documents.count

- [ ] Add spans to fetch-registry.ts (lines 47-71, 73-99)
  - getDevices(): operation="fetch_devices"
  - getRooms(): operation="fetch_rooms"
  - Registry building: operation="build_registry"
  - Attributes: devices.count, rooms.count

- [ ] Add spans to export-dashboard.ts (multiple locations)
  - findDashboardByName() (lines 113-159): operation="find_dashboard"
  - exportDashboard() (lines 184-262): operation="export_dashboard"
  - stripSensitiveMetadata() (lines 95-111): operation="strip_metadata"
  - Attributes: dashboard.name, dashboard.id, objects.count

- [ ] Update spec/OPEN-TELEMETRY.md
  - Add "Manual Instrumentation Examples" section
  - Document withSpan() helper usage
  - Show code examples from each script
  - List common span attributes
  - Explain APM UI navigation

### Automated Tests

- [ ] Unit tests for src/instrumentation.ts
  - Test withSpan() with sync/async functions
  - Verify span attributes
  - Test error handling (span records exception, still ends)
  - Mock tracer to verify span lifecycle

### User Tests

- [ ] Test poll.ts spans
  - Start collector: yarn otel:collector:start
  - Run: yarn poll (collect events, Ctrl+C)
  - APM UI → Services → shc2es-poll → Traces
  - Verify: subscribe, process_event spans with attributes

- [ ] Test ingest.ts spans
  - Run: yarn ingest --setup
  - APM UI → Services → shc2es-ingest → Traces
  - Verify: bulk_import_file, transform_document, load_registry spans

- [ ] Test fetch-registry.ts spans
  - Run: yarn registry
  - APM UI → Services → shc2es-registry → Traces
  - Verify: fetch_devices, fetch_rooms, build_registry spans

- [ ] Test export-dashboard.ts spans
  - Run: yarn dashboard:export shc2es
  - APM UI → Services → shc2es-export-dashboard → Traces
  - Verify: find_dashboard, export_dashboard, strip_metadata spans

## Review
- [ ] Bug/cleanup items if found

## Notes
[Important findings]
