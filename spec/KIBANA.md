# Kibana Dashboard API Reference

This document provides API reference information for Kibana's Saved Objects API, which is used by shc2es for dashboard import/export.

## Implementation Status

✅ **Implemented Features:**
- Dashboard export by name via CLI (`yarn dashboard:export <name>`)
- Dashboard listing (`yarn dashboard:export --list`)
- Automatic dashboard import during setup (`yarn ingest:setup`)
- Saved object ID prefixing for multi-environment isolation
- TLS configuration (custom CA cert, skip verification)
- Sensitive metadata stripping (created_by, updated_by, etc.)
- Basic authentication

📋 **Optional Features** (see [TODO.md](./TODO.md)):
- API key authentication
- Kibana space isolation (`space_id` parameter)
- Cross-version compatibility mode
- Dashboard copy mode (`createNewCopies`)

## API Endpoints

### Export API

Export dashboards and their dependencies as NDJSON.

**Endpoint:** `POST /api/saved_objects/_export`

**Headers:**
- `kbn-xsrf: true` (required for CSRF protection)
- `Content-Type: application/json`
- `Authorization: Basic <base64>` or `Authorization: ApiKey <key>`

**Request Body:**
```json
{
  "type": "dashboard",
  "objects": [{"type": "dashboard", "id": "dashboard-id"}],
  "includeReferencesDeep": true,
  "excludeExportDetails": false
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Export all objects of this type (e.g., `"dashboard"`) |
| `objects` | array | Specific objects to export with `{type, id}` |
| `includeReferencesDeep` | boolean | **Always `true`** - includes visualizations, data views, searches |
| `excludeExportDetails` | boolean | Omit export metadata line (default: `false`) |

**Response:** NDJSON file with saved objects

### Import API

Import saved objects from NDJSON file.

**Endpoint:** `POST /api/saved_objects/_import`

**Headers:**
- `kbn-xsrf: true` (required)
- `Authorization: Basic <base64>` or `Authorization: ApiKey <key>`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `overwrite` | boolean | Replace existing objects (default: `false`) |
| `createNewCopies` | boolean | Generate new IDs (default: `false`) |
| `compatibilityMode` | boolean | Apply cross-version adjustments (default: `false`) |
| `space_id` | string | Target Kibana space (default space if omitted) |

**Note:** `overwrite` and `createNewCopies` are mutually exclusive.

**Request:** `multipart/form-data` with NDJSON file

**Response:**
```json
{
  "success": true,
  "successCount": 5,
  "successResults": [
    {"type": "index-pattern", "id": "...", "meta": {...}},
    {"type": "visualization", "id": "...", "meta": {...}},
    {"type": "dashboard", "id": "...", "meta": {...}}
  ],
  "errors": [],
  "warnings": []
}
```

### Find API

Search for saved objects.

**Endpoint:** `GET /api/saved_objects/_find`

**Query Parameters:**
- `type=dashboard` - Filter by object type
- `search=<name>` - Search query
- `search_fields=title` - Fields to search
- `per_page=100` - Results per page

**Response:**
```json
{
  "saved_objects": [
    {
      "id": "dashboard-id",
      "type": "dashboard",
      "attributes": {"title": "Dashboard Name", ...}
    }
  ],
  "total": 1
}
```

## NDJSON Format

Kibana uses **Newline Delimited JSON** (NDJSON) where each line is a complete JSON object:

```
{"type":"index-pattern","id":"smart-home-events-*","attributes":{...}}
{"type":"visualization","id":"viz-temperature","attributes":{...},"references":[...]}
{"type":"dashboard","id":"smart-home-dashboard","attributes":{...},"references":[...]}
{"exportedCount":3,"missingRefCount":0,"missingReferences":[]}
```

**Last line:** Export metadata (counts, missing references)

**Object types** (with `includeReferencesDeep: true`):
- `dashboard` - Dashboard definition
- `visualization` - Legacy visualizations
- `lens` - Lens visualizations
- `search` - Saved searches
- `index-pattern` / `data-view` - Data view definitions
- `map` - Map visualizations

## Version Compatibility

Kibana saved objects have strict version compatibility:

| Import Into | Supported Export Versions |
|-------------|--------------------------|
| Same version | ✅ Yes |
| Newer minor (same major) | ✅ Yes |
| Next major version | ✅ Yes |
| Older version | ❌ No |

**Example:** Dashboard exported from 8.10 can import into 8.10, 8.11, 8.12, or 9.0, but **not** into 8.9.

## Common Import Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `409 Conflict` | Object exists, `overwrite=false` | Use `?overwrite=true` |
| `400 Bad Request` | Malformed NDJSON | Re-export dashboard |
| `missing_references` | Data view doesn't exist | Create index template first, ingest some data |
| `413 Payload Too Large` | File exceeds limit | Increase `savedObjects.maxImportPayloadBytes` in Kibana config |

## Security Notes

- **Never commit credentials** - Use environment variables
- **API key auth** - Preferred over basic auth for automation:
  ```bash
  -H "Authorization: ApiKey <base64-encoded-key>"
  ```
- **Saved Objects Management privilege** - Required for import/export
- **Space isolation** - Use `space_id` parameter for multi-tenant setups

## References

- [Saved Objects API](https://www.elastic.co/guide/en/kibana/current/saved-objects-api.html)
- [Export API](https://www.elastic.co/docs/api/doc/kibana/operation/operation-post-saved-objects-export)
- [Import API](https://www.elastic.co/docs/api/doc/kibana/operation/operation-post-saved-objects-import)
- [Managing Saved Objects](https://www.elastic.co/guide/en/kibana/current/managing-saved-objects.html)
