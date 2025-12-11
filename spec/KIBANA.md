# Kibana Dashboard Integration Spec

## Overview

Programmatic export and import of Kibana dashboards as part of the `yarn ingest:setup` workflow, enabling version-controlled dashboard definitions that can be deployed automatically.

## Target Environment

- **Kibana**: `https://<ip>:5601`
- **Auth**: Basic auth (`elastic` user, same as Elasticsearch)
- **TLS**: Self-signed certificate (skip verification)

## Architecture

```
dashboards/
  smart-home.ndjson      # Exported dashboard + all dependencies
        │
        ▼
┌─────────────────────────┐
│  yarn ingest:setup      │
│  - Create ES pipeline   │
│  - Create index template│
│  - Import dashboard     │  ◄── NEW
└─────────────────────────┘
        │
        ▼
Kibana Saved Objects API
  POST /api/saved_objects/_import
```

## Dashboard Export

### Via Kibana UI

1. Navigate to **Stack Management → Saved Objects**
2. Click **Type** dropdown, select "dashboard"
3. Select the dashboard(s) to export
4. Click **Export**
5. Enable **"Include related objects"** (critical!)
6. Save the `.ndjson` file to `dashboards/`

### Via API (Recommended for CI/CD)

Export a specific dashboard by ID:

```bash
curl -X POST "https://<kibana-host>/api/saved_objects/_export" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -u "elastic:$ES_PASSWORD" \
  --insecure \
  -d '{
    "objects": [
      {
        "type": "dashboard",
        "id": "<dashboard-id>"
      }
    ],
    "includeReferencesDeep": true
  }' > dashboards/smart-home.ndjson
```

Export all dashboards:

```bash
curl -X POST "https://<kibana-host>/api/saved_objects/_export" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -u "elastic:$ES_PASSWORD" \
  --insecure \
  -d '{
    "type": "dashboard",
    "includeReferencesDeep": true
  }' > dashboards/all-dashboards.ndjson
```

### Export API Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Saved object type to export (e.g., `"dashboard"`) |
| `objects` | array | Specific objects with `id` and `type` |
| `includeReferencesDeep` | boolean | Include all dependencies (visualizations, data views, searches). **Always set to `true`** |
| `excludeExportDetails` | boolean | Omit export metadata (default: `false`) |

### Required Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `kbn-xsrf` | `true` | CSRF protection (required for all mutating requests) |
| `Content-Type` | `application/json` | Request body format |

## NDJSON Format

Kibana exports dashboards as **Newline Delimited JSON** (NDJSON). Each line is a complete JSON object representing a saved object:

```
{"type":"index-pattern","id":"smart-home-events-*","attributes":{...}}
{"type":"visualization","id":"viz-temperature","attributes":{...},"references":[...]}
{"type":"dashboard","id":"smart-home-dashboard","attributes":{...},"references":[...]}
{"exportedCount":3,"missingRefCount":0,"missingReferences":[]}
```

The last line contains export metadata (counts, missing references).

### Object Types Included

When exporting a dashboard with `includeReferencesDeep: true`:

- `dashboard` - The dashboard itself
- `visualization` - Charts, gauges, tables
- `lens` - Lens visualizations
- `search` - Saved searches
- `index-pattern` / `data-view` - Data view definitions
- `map` - Map visualizations

## Dashboard Import

### Via API

```bash
curl -X POST "https://<kibana-host>/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" \
  -u "elastic:$ES_PASSWORD" \
  --insecure \
  --form "file=@dashboards/smart-home.ndjson"
```

### Import API Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `overwrite` | boolean | Replace existing objects with same IDs (default: `false`) |
| `createNewCopies` | boolean | Generate new IDs for all objects (default: `false`) |
| `compatibilityMode` | boolean | Apply cross-version adjustments (default: `false`) |
| `space_id` | string | Target Kibana space (default space if omitted) |

**Note:** `overwrite` and `createNewCopies` are mutually exclusive.

### Import Response

```json
{
  "success": true,
  "successCount": 5,
  "successResults": [
    { "type": "index-pattern", "id": "smart-home-events-*", "meta": {...} },
    { "type": "visualization", "id": "viz-temperature", "meta": {...} },
    { "type": "dashboard", "id": "smart-home-dashboard", "meta": {...} }
  ],
  "errors": [],
  "warnings": []
}
```

## Implementation

### File Structure

```
project/
├── dashboards/
│   └── smart-home.ndjson    # Version-controlled dashboard
├── src/
│   └── ingest.ts            # Setup script with dashboard import
└── spec/
    └── KIBANA.md            # This file
```

### Integration with Setup Script

Add to `src/ingest.ts`:

```typescript
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';

const KIBANA_NODE = process.env.KIBANA_NODE;
const DASHBOARD_FILE = path.join(__dirname, '..', 'dashboards', 'smart-home.ndjson');

async function importDashboard(): Promise<void> {
  if (!KIBANA_NODE) {
    log.warn('KIBANA_NODE not set, skipping dashboard import');
    return;
  }

  if (!existsSync(DASHBOARD_FILE)) {
    log.warn({ dashboardFile: DASHBOARD_FILE }, 'Dashboard file not found, skipping import');
    return;
  }

  log.info({ dashboardFile: DASHBOARD_FILE }, 'Importing Kibana dashboard');

  const fileContent = readFileSync(DASHBOARD_FILE);
  const formData = new FormData();
  formData.append('file', new Blob([fileContent]), 'smart-home.ndjson');

  const auth = Buffer.from(
    `${process.env.ES_USER || 'elastic'}:${process.env.ES_PASSWORD}`
  ).toString('base64');

  const response = await fetch(
    `${KIBANA_NODE}/api/saved_objects/_import?overwrite=true`,
    {
      method: 'POST',
      headers: {
        'kbn-xsrf': 'true',
        'Authorization': `Basic ${auth}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    log.error({ status: response.status, body: text }, 'Dashboard import failed');
    return;
  }

  const result = await response.json();

  if (result.success) {
    log.info({ successCount: result.successCount }, 'Dashboard imported successfully');
  } else {
    log.error({ errors: result.errors }, 'Dashboard import had errors');
  }
}

async function setup(): Promise<void> {
  // ... existing pipeline and template creation ...

  // Import Kibana dashboard
  await importDashboard();
}
```

### TLS Certificate Handling

For self-signed certificates, Node.js fetch requires disabling certificate verification. Add to the script entry point:

```typescript
// Disable TLS verification for self-signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
```

Or use a custom fetch agent (more targeted approach).

## Environment Variables

Add to `.env`:

```bash
# Kibana connection (for dashboard import)
KIBANA_NODE=https://192.168.x.x:5601
```

Update `.env.example`:

```bash
# Elasticsearch connection (required)
ES_NODE=https://192.168.x.x:9200
ES_USER=elastic
ES_PASSWORD=xxxxx

# Index configuration (optional)
ES_INDEX_PREFIX=smart-home-events

# Kibana connection (optional, for dashboard import)
KIBANA_NODE=https://192.168.x.x:5601
```

## Commands

| Command | Description |
|---------|-------------|
| `yarn ingest:setup` | Create pipeline, template, AND import dashboard |
| `yarn dashboard:export` | Export current dashboard from Kibana (manual) |

### Export Script (Optional)

Add to `package.json` for convenience:

```json
{
  "scripts": {
    "dashboard:export": "curl -X POST \"$KIBANA_NODE/api/saved_objects/_export\" -H 'kbn-xsrf: true' -H 'Content-Type: application/json' -u \"elastic:$ES_PASSWORD\" --insecure -d '{\"type\":\"dashboard\",\"includeReferencesDeep\":true}' > dashboards/smart-home.ndjson"
  }
}
```

## Version Compatibility

Kibana saved objects have strict version compatibility:

| Import Into | Supported Export Versions |
|-------------|--------------------------|
| Same version | Yes |
| Newer minor (same major) | Yes |
| Next major version | Yes |
| Older version | **No** |

Example: Dashboard exported from 8.10 can import into 8.10, 8.11, 8.12, or 9.0, but NOT into 8.9.

## Workflow

### Initial Setup

1. Build dashboard manually in Kibana UI
2. Export dashboard: `yarn dashboard:export` or via UI
3. Commit `dashboards/smart-home.ndjson` to repo
4. Run `yarn ingest:setup` to deploy everything

### Updating Dashboard

1. Modify dashboard in Kibana UI
2. Re-export: `yarn dashboard:export`
3. Review diff in git
4. Commit changes
5. Deploy to other environments with `yarn ingest:setup`

### CI/CD Integration

```yaml
# Example GitHub Actions workflow
deploy:
  steps:
    - name: Setup Elasticsearch
      run: yarn ingest:setup
      env:
        ES_NODE: ${{ secrets.ES_NODE }}
        ES_PASSWORD: ${{ secrets.ES_PASSWORD }}
        KIBANA_NODE: ${{ secrets.KIBANA_NODE }}
```

## Error Handling

### Common Import Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `409 Conflict` | Object exists, `overwrite=false` | Use `?overwrite=true` |
| `400 Bad Request` | Malformed NDJSON | Re-export dashboard |
| `missing_references` | Data view doesn't exist | Ensure index template created first |
| `413 Payload Too Large` | File exceeds limit | Increase `savedObjects.maxImportPayloadBytes` |

### Missing References

If the dashboard references a data view that doesn't exist, import will fail. The setup order matters:

1. Create Elasticsearch index template (ensures indices have correct mappings)
2. Ingest some data (creates at least one index)
3. Import dashboard (data view can now resolve)

For fresh deployments without data, consider:
- Pre-creating the data view in the NDJSON
- Using a data view with `allowNoIndex: true`

## Security Considerations

- **Never commit credentials** - Use environment variables
- **API key auth** - Preferred over basic auth for automation:
  ```bash
  -H "Authorization: ApiKey <base64-encoded-key>"
  ```
- **Saved Objects Management privilege** - Required for import/export operations
- **Space isolation** - Use `space_id` parameter for multi-tenant setups

## References

- [Saved Objects API](https://www.elastic.co/guide/en/kibana/current/saved-objects-api.html)
- [Export API](https://www.elastic.co/docs/api/doc/kibana/operation/operation-post-saved-objects-export)
- [Import API](https://www.elastic.co/docs/api/doc/kibana/operation/operation-post-saved-objects-import)
- [Managing Saved Objects](https://www.elastic.co/guide/en/kibana/current/managing-saved-objects.html)
