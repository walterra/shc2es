# Architecture Diagram - Add visual diagram to README or spec showing data flow
**Status:** Done
**Created:** 2025-12-14-22-45-08
**Started:** 2025-12-14-22-47-00
**Agent PID:** 3269

## Description

**What we're building:**
A visual architecture diagram showing the complete data flow from Bosch Smart Home Controller II through the shc2es CLI tools to Elasticsearch and Kibana.

The diagram will illustrate:
1. Hardware layer: Controller II with ZigBee devices
2. Data collection: `poll.ts` long polling → NDJSON files
3. Optional enrichment: Device registry for human-readable names
4. Data ingestion: `ingest.ts` batch/watch modes → Elasticsearch
5. Visualization: Kibana dashboards
6. Observability: OpenTelemetry → Elastic APM

**Format:** Mermaid markdown diagram (renders on GitHub, VS Code, many doc platforms)

**Placement:** New file `docs/architecture.md` with detailed diagram + component descriptions, referenced from README.md

**How we'll know it works:**
- Diagram renders correctly in Mermaid Live Editor (https://mermaid.live)
- All components and data flows are accurately represented
- README.md links to the architecture documentation
- Diagram matches actual codebase behavior verified from source code

## Implementation Plan
- [x] Create `docs/architecture.md` with Mermaid diagram showing:
  - Hardware: Controller II + ZigBee devices
  - CLI commands: poll, registry, ingest (batch/watch), dashboard export
  - Storage: NDJSON files, device registry, app logs, certificates
  - Elasticsearch: indices, ingest pipeline, index template
  - Kibana: dashboards
  - OpenTelemetry: APM traces/metrics
- [x] Add component descriptions below diagram
- [x] Add data flow explanations for each path
- [x] Add link to architecture.md in README.md (after Quick Start, before Prerequisites)
- [x] Automated test: Verify Mermaid syntax in CI (lightweight custom validator)
- [x] User test: Paste diagram into https://mermaid.live and verify it renders correctly
  - Screenshot verified: All 5 sections render with proper colors and styling
  - Complete data flow visible from Controller → poll → NDJSON → ingest → ES → Kibana
  - OpenTelemetry observability paths shown correctly

## Review
- [x] Bug fix: Removed confusing ES self-loop (was: `ES -->|"Daily Indices"| ES`)
  - The ES node label already indicates it contains indices, pipeline, and template
  - Self-loop was redundant and visually confusing
- [x] Enhancement: Added `docs/` and `dashboards/` to package.json "files" array
  - Ensures architecture documentation is published with npm package
  - Users can read architecture.md after installing via npm
- [x] Layout improvement: Changed from TB (top-bottom) to LR (left-right) flow
  - Better visual hierarchy: Hardware → CLI → Storage → Elastic Stack → Observability
  - Cleaner main data path: Controller → poll → NDJSON → ingest → ES → Kibana
  - Condensed Storage section using direction TB within subgraph
  - Simplified node labels for clarity (removed redundant text)
  - Used line styles to show importance: solid (main flow), dashed (supporting & observability)
- [x] Bug fix: Connected Observability section with dashed trace arrows
  - Changed from invisible links (`~~~`) to visible dashed arrows (`-.->`)
  - Shows all CLI commands send traces to OpenTelemetry → Elastic APM

## Notes

**Mermaid validation approach:**
- Initially tried `@mermaid-js/mermaid-cli` but it requires Puppeteer (headless Chrome) - way too heavy
- Created lightweight custom validator (`scripts/validate-mermaid.js`) that checks:
  - Mermaid code blocks exist
  - Blocks are properly closed
  - Valid graph type declarations
  - No empty blocks
- No external dependencies needed, runs in <1 second
