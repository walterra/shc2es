---
"shc2es": minor
---

Add `--pattern` option to `ingest` command for selective file ingestion

The `ingest` command now accepts a `--pattern` option to specify which files to import:

```bash
# Import specific files using a glob pattern
shc2es ingest --pattern "events-2025-12-*.ndjson"

# Import a single file
shc2es ingest --pattern "events-2025-12-10.ndjson"
```

Patterns without `/` are relative to the data directory (`~/.shc2es/data/`). Absolute paths are also supported.
