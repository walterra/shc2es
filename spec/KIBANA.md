# Kibana Dashboard Reference Documentation

### Architecture

Dashboard export/import workflow:

```
┌────────────────────────────────────────────────────────────┐
│                        Workflow                            │
└────────────────────────────────────────────────────────────┘

1. Manual Dashboard Creation (Kibana UI)
   └─> Build visualizations, configure layout

2. Export Dashboard (CLI)
   ┌─────────────────────────────────────────┐
   │  yarn dashboard:export "Smart Home"     │
   │                                         │
   │  • Searches for dashboard by name       │
   │  • Exports with deep references         │
   │  • Strips sensitive metadata            │
   │  • Saves to dashboards/smart-home.ndjson│
   └─────────────────────────────────────────┘
                      │
                      ▼
3. Version Control (Git)
   └─> Commit dashboards/smart-home.ndjson

4. Deployment (Automated)
   ┌─────────────────────────────────────────┐
   │  yarn ingest:setup                      │
   │                                         │
   │  • Creates ES pipeline                  │
   │  • Creates index template               │
   │  • Prefixes saved object IDs            │
   │  • Imports to Kibana                    │
   └─────────────────────────────────────────┘
                      │
                      ▼
5. Multi-Environment Support
   └─> Different INDEX_PREFIX creates isolated dashboards
```

### NDJSON Format

Kibana exports dashboards as **Newline Delimited JSON** (NDJSON). Each line is a complete JSON object representing a saved object:

```ndjson
{"type":"index-pattern","id":"smart-home-events-*","attributes":{...}}
{"type":"visualization","id":"viz-temperature","attributes":{...},"references":[...]}
{"type":"dashboard","id":"smart-home-dashboard","attributes":{...},"references":[...]}
{"exportedCount":3,"missingRefCount":0,"missingReferences":[]}
```

The last line contains export metadata (counts, missing references).

### Object Types Exported

When exporting a dashboard with `includeReferencesDeep: true`, the export includes:

| Type                          | Description            |
| ----------------------------- | ---------------------- |
| `dashboard`                   | The dashboard itself   |
| `visualization`               | Charts, gauges, tables |
| `lens`                        | Lens visualizations    |
| `search`                      | Saved searches         |
| `index-pattern` / `data-view` | Data view definitions  |
| `map`                         | Map visualizations     |

### Sensitive Metadata Stripping

The export script automatically removes these fields to prevent privacy leaks and version conflicts:

- `created_by` - Creator username
- `updated_by` - Last modifier username
- `created_at` - Creation timestamp
- `updated_at` - Modification timestamp
- `version` - Internal version counter

### Index Prefix Support

The import process automatically prefixes all saved object IDs to support multi-environment deployments:

```bash
# Development environment
ES_INDEX_PREFIX=dev yarn ingest:setup
# Creates: dev-smart-home-dashboard, dev-viz-temperature, etc.

# Production environment
ES_INDEX_PREFIX=prod yarn ingest:setup
# Creates: prod-smart-home-dashboard, prod-viz-temperature, etc.
```

This allows the same dashboard NDJSON to be deployed to multiple environments with isolated Kibana objects.

### Kibana Saved Objects API

The implementation uses these API endpoints:

#### Export API

```http
POST /api/saved_objects/_export
Content-Type: application/json
kbn-xsrf: true

{
  "objects": [{"type": "dashboard", "id": "<dashboard-id>"}],
  "includeReferencesDeep": true
}
```

**Required Headers:**

- `kbn-xsrf: true` - CSRF protection
- `Authorization: Basic <base64>` - Basic auth

**Parameters:**

- `includeReferencesDeep: true` - Include all dependencies (always required)

#### Import API

```http
POST /api/saved_objects/_import?overwrite=true
kbn-xsrf: true
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="file"; filename="dashboard.ndjson"

<ndjson content>
```

**Query Parameters:**

- `overwrite=true` - Replace existing objects with same IDs

#### Find API

```http
GET /api/saved_objects/_find?type=dashboard&search=<name>&search_fields=title
kbn-xsrf: true
```

Used by the export script to search dashboards by name.

### Environment Variables

```bash
# Kibana connection (optional, for dashboard import/export)
KIBANA_NODE=https://192.168.x.x:5601

# TLS configuration (shared with Elasticsearch)
ES_TLS_VERIFY=false              # Disable cert verification
ES_CA_CERT=/path/to/ca.pem       # Custom CA certificate

# Authentication (uses same creds as Elasticsearch)
ES_USER=elastic
ES_PASSWORD=xxxxx

# Multi-environment support
ES_INDEX_PREFIX=dev              # Prefix for isolated dashboards
```

### Yarn Commands

```bash
# List available dashboards
yarn dashboard:export --list

# Export a dashboard by name (case-insensitive search)
yarn dashboard:export "Smart Home"
yarn dashboard:export shc2es

# Setup with dashboard import
yarn ingest:setup
```

### File Structure

```
project/
├── dashboards/
│   └── smart-home.ndjson        # Exported dashboard (version-controlled)
├── src/
│   ├── export-dashboard.ts      # Export CLI script
│   └── ingest.ts                # Import during setup
└── spec/
    └── KIBANA.md                # This file
```

### Version Compatibility

Kibana saved objects have strict version compatibility:

| Import Into              | Supported Export Versions |
| ------------------------ | ------------------------- |
| Same version             | ✅ Yes                    |
| Newer minor (same major) | ✅ Yes                    |
| Next major version       | ✅ Yes                    |
| Older version            | ❌ No                     |

**Example:** Dashboard exported from 8.10 can import into 8.10, 8.11, 8.12, or 9.0, but **not** into 8.9.

### Error Handling

Common import errors and solutions:

| Error                   | Cause                            | Solution                                                       |
| ----------------------- | -------------------------------- | -------------------------------------------------------------- |
| `409 Conflict`          | Object exists, `overwrite=false` | Automatically handled (we use `?overwrite=true`)               |
| `400 Bad Request`       | Malformed NDJSON                 | Re-export dashboard                                            |
| `missing_references`    | Data view doesn't exist          | Import runs after index template creation                      |
| `413 Payload Too Large` | File exceeds limit               | Increase `savedObjects.maxImportPayloadBytes` in Kibana config |

### Setup Order

The `yarn ingest:setup` command runs steps in this order to avoid missing references:

1. **Create ingest pipeline** - Adds `event.ingested` timestamp
2. **Create index template** - Ensures indices have correct mappings
3. **Import dashboard** - Data views can now resolve

If you import a dashboard before indices exist, the data view will be created but won't show data until indices are created.

## Official Kibana API Documentation

- [Saved Objects API](https://www.elastic.co/guide/en/kibana/current/saved-objects-api.html)
- [Export API](https://www.elastic.co/docs/api/doc/kibana/operation/operation-post-saved-objects-export)
- [Import API](https://www.elastic.co/docs/api/doc/kibana/operation/operation-post-saved-objects-import)
- [Managing Saved Objects](https://www.elastic.co/guide/en/kibana/current/managing-saved-objects.html)
