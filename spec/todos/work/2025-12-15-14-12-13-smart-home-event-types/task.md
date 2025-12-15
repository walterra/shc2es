# Smart Home Event Types - Replace [key: string]: unknown with exhaustive union types

**Status:** In Progress  
**Created:** 2025-12-15-14-12-13  
**Started:** 2025-12-15-14:30:00  
**Agent PID:** 2325

## Description

**Problem**: `src/ingest.ts` currently uses a loosely-typed `SmartHomeEvent` interface with `[key: string]: unknown` catch-all, making it unsafe and error-prone. TypeScript can't catch typos or validate event structure.

**Solution**: Replace with exhaustive discriminated union types that match the actual Bosch Smart Home Controller II event types:
- `DeviceServiceDataEvent` - Device sensor/state updates (temperature, humidity, valve position, etc.)
- `DeviceEvent` - Device information and status
- `RoomEvent` - Room metadata updates  
- `MessageEvent` - System messages and error notifications

**Type Safety Benefits**:
- Use `@type` field as discriminator for type narrowing
- All event fields will be type-checked
- `never` fallbacks ensure exhaustive switch handling
- Remove unsafe `[key: string]: unknown` indexing

**Testing Strategy**:
- Unit tests: Parse real event samples and validate types
- Verify `transformDoc()` handles all event types correctly
- Test exhaustive switch with compile-time validation
- Integration: Run ingest on real data files without errors

**Success Criteria**:
- TypeScript compiles without `any` or index signature usage
- All 4 event types properly typed with discriminated unions
- Existing functionality preserved (same data ingested)
- Test coverage maintained at 70%+

## Implementation Plan

### 1. Create Type Definitions
- [x] Create `src/types/smart-home-events.ts` with:
  - Base fields interface (time, trace_id, span_id, trace_flags)
  - `DeviceServiceDataEvent` interface (deviceId, path, state, id, operations?, faults?)
  - `DeviceEvent` interface (id, name, deviceModel, manufacturer, serial, status, etc.)
  - `RoomEvent` interface (id, name, iconId, extProperties)
  - `MessageEvent` interface (id, sourceId, sourceType, flags, messageCode, arguments, timestamp, sourceName)
  - `SmartHomeEvent` discriminated union: `DeviceServiceDataEvent | DeviceEvent | RoomEvent | MessageEvent`
  - Export all types
  - Comprehensive JSDoc with examples

### 2. Create transforms.ts module
- [x] Create `src/transforms.ts` with exported transformation functions
- [x] Export `extractMetric()` with exhaustive type narrowing
- [x] Export `generateDocId()` with exhaustive type narrowing  
- [x] Add comprehensive JSDoc documentation
- [x] Keep functions pure and testable (no external dependencies)

### 3. Update ingest.ts
- [x] Import types from `./types/smart-home-events`
- [x] Import `extractMetric`, `generateDocId` from `./transforms`
- [x] Remove old `SmartHomeEvent` interface
- [x] Remove duplicate function implementations (now in transforms.ts)
- [x] Update `transformDoc()` to use new typed events
- [x] Fix type errors in logging statements (use type guards for optional fields)

### 4. Add Automated Tests
- [x] Create `tests/unit/types/smart-home-events.test.ts`
  - Test parsing real DeviceServiceData event samples (humidity, temperature, valve)
  - Test parsing Device event sample
  - Test parsing Room event sample  
  - Test parsing Message event sample
  - Test type narrowing with @type discriminator
  - 25 passing tests
- [x] Create `tests/unit/ingest-transforms.test.ts`
  - **Now testing REAL functions from src/transforms.ts** (not mocks!)
  - Test `extractMetric()` with various state types
  - Test `generateDocId()` for all event types
  - 11 passing tests
- [x] Create `tests/fixtures/smart-home-events.json` with real event samples

### 5. User Testing
- [x] Build: `yarn build` ✅ (0.80s, no errors)
- [x] Lint: `yarn lint` ✅ (1.30s, no errors)
- [x] Format: `yarn format` ✅ (0.34s, all files formatted)
- [x] Tests: `yarn test` ✅ (163 tests passed, 94.05% coverage)
- [ ] Integration test: `yarn ingest --pattern "events-2025-12-*.ndjson"` on real data (READY TO RETRY)
- [ ] Verify: Check Elasticsearch for successfully ingested typed events
- [ ] Verify: No type errors or runtime errors during ingestion

## Review
- [x] Bug/cleanup items if found (3 bugs fixed during integration testing)
- [x] Created changeset: `.changeset/exhaustive-smart-home-event-types.md`

## Notes

### Findings from Bosch Smart Home Bridge Library Investigation

**Library Type Support**: The `bosch-smart-home-bridge` npm package (v1.x) returns `any` types for all API responses, including `longPolling()` which returns `BshbResponse<{ result: any[]; jsonrpc: string }>`. The library does not export specific event type definitions.

**Official Bosch API Docs**: Referenced at https://github.com/BoschSmartHome/bosch-shc-api-docs - provides OpenAPI specs but requires local access. The library itself doesn't constrain event types.

**Real Event Analysis**: From actual event data in `~/.shc2es/data/events-*.ndjson`:

1. **OpenTelemetry Fields** (all events):
   - `time`: ISO timestamp string
   - `trace_id`, `span_id`, `trace_flags`: OTel context (added by our instrumentation)

2. **DeviceServiceData** (sensor/state updates):
   - `@type`: "DeviceServiceData"
   - `id`: Service ID (e.g., "HumidityLevel", "ValveTappet", "RoomClimateControl")
   - `deviceId`: Device identifier
   - `path`: API path (e.g., "/devices/hdm:ZigBee:xxx/services/HumidityLevel")
   - `state`: Typed state object with `@type` (e.g., "humidityLevelState", "valveTappetState", "climateControlState")
   - `operations?`: Array of available operations
   - `faults?`: Object with `entries` array for error conditions

3. **device** (device metadata):
   - `@type`: "device"
   - `id`: Device identifier
   - `name`: Human-readable name
   - `deviceModel`: Model string (e.g., "TRV_GEN2_DUAL")
   - `manufacturer`: "BOSCH"
   - `serial`: Serial number
   - `status`: Status string (e.g., "UNDEFINED")
   - `rootDeviceId`: Root device ID
   - `parentDeviceId?`: Parent device if child
   - `childDeviceIds`: Array of child device IDs
   - `deviceServiceIds`: Array of service IDs
   - `supportedProfiles`: Array of profiles
   - `profile`: Profile string
   - `installationTimestamp`: Unix timestamp
   - `roomId?`: Associated room ID

4. **room** (room metadata):
   - `@type`: "room"
   - `id`: Room identifier (e.g., "hz_1")
   - `name`: Room name
   - `iconId`: Icon identifier
   - `extProperties`: Key-value object (e.g., `{"humidity": "39.8"}`)

5. **message** (system messages/errors):
   - `@type`: "message"
   - `id`: Message UUID
   - `sourceId`: Device/source ID
   - `sourceType`: Type string (e.g., "DEVICE")
   - `sourceName`: Human-readable source name
   - `flags`: Array of flags (e.g., ["STATUS", "STICKY"])
   - `messageCode`: Object with `name` and `category` (e.g., "ERROR", "INFO")
   - `arguments`: Key-value object with message params
   - `timestamp`: Unix timestamp (milliseconds)

**Discriminated Union Strategy**: Use `@type` as the discriminator field. TypeScript will narrow types automatically when checking this field in conditionals or switch statements.

**State Type Complexity**: `DeviceServiceData.state` objects have their own `@type` field (e.g., "humidityLevelState", "valveTappetState"). For initial implementation, we can type this as `Record<string, unknown>` and refine later if needed for specific state extraction.

**Backwards Compatibility**: No breaking changes - we're adding types to previously untyped code. The transformation logic in `transformDoc()` remains the same, just with type safety.

### Bug Fix: Missing Optional Field Check

**Issue Found During Integration Testing**: Fatal error "Cannot convert undefined or null to object" when processing room events.

**Root Cause**: 
- Some room events don't have `extProperties` field (6 out of 371 in sample data)
- `extractMetric()` tried to iterate `Object.entries(doc.extProperties)` without checking if it exists
- TypeScript type incorrectly marked `extProperties` as required

**Fix Applied**:
- Made `RoomEvent.extProperties` optional in type definition
- Added null check in `extractMetric()` before accessing `extProperties`
- Added test case for room events without extProperties
- Now matches real-world data structure

### Code Quality Improvement: Extracted Testable Module

**Problem Identified**: Initial test file created mock implementations of transformation functions instead of testing real code - this is an anti-pattern that provides false confidence.

**Solution Implemented**: 
- Created `src/transforms.ts` - pure, dependency-free module with transformation functions
- Exported `extractMetric()` and `generateDocId()` with full JSDoc documentation
- Updated `src/ingest.ts` to import from `transforms.ts` (DRY principle)
- Updated tests to import and test **real** functions, not mocks

**Benefits**:
- Tests now verify actual production code behavior
- Transformation functions are reusable across codebase
- No external dependencies (chokidar, ES client) = easy to test
- Better separation of concerns (pure logic vs I/O operations)

### Bug Fix #2: Defensive ID Generation

**Issue Found During Integration Testing**: Elasticsearch error "expected a simple value for field [_id] but found [START_OBJECT]" on bulk import.

**Root Cause**: While TypeScript types guarantee fields are strings, need defensive programming to ensure runtime values are always safe strings.

**Fix Applied**:
- Added `toString()` helper function in `generateDocId()` to safely convert all values to strings
- Handles null/undefined gracefully (returns "unknown")
- Handles unexpected objects by JSON.stringify (shouldn't happen with types, but prevents ES errors)
- Ensures generated IDs are always valid strings for Elasticsearch `_id` field

### Bug Fix #3: Missing Event Type - "client"

**Issue Found During Integration Testing**: Fatal error when ingesting - the entire document object was being used as the Elasticsearch `_id` field instead of a string.

**Root Cause**: 
- A 5th event type exists: `"@type": "client"` (mobile app connections)
- Not documented in our initial analysis (only appeared in one file: events-2025-12-12.ndjson)
- `generateDocId()` switch statement didn't have a case for "client"
- Fell through to `default` case with `never` type
- At runtime, returned `undefined`, which caused destructuring to use the whole document as ID

**Fix Applied**:
- Added `ClientEvent` interface to type definitions with all fields (id, name, clientType, roles, etc.)
- Added to discriminated union: `SmartHomeEvent = ... | ClientEvent`
- Updated `extractMetric()` to handle client events (returns null - no metrics)
- Updated `generateDocId()` to generate proper IDs: `client-<id>-<timestamp>`
- Updated `transformDoc()` in ingest.ts to handle client events
- Added test fixture from real data
- Added 3 new tests (parse, extract metric, generate ID)

**Event Types Now Supported** (5 total):
1. `DeviceServiceData` - Sensor readings and device states
2. `device` - Device metadata
3. `room` - Room information
4. `message` - System messages/errors
5. `client` - Connected client applications (NEW)
