---
"shc2es": patch
---

Fix `ingest:watch` for chokidar v5 compatibility. Glob patterns are no longer supported in chokidar v4+, so the watcher now monitors the data directory with a filter function instead.
