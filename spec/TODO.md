# TODO

## Code Quality

- Type Safety for Saved Objects - Strengthen TypeScript types for saved objects. Currently using unknown and any in several places. Define proper interfaces for Kibana saved object API responses

- Logging Consistency Audit - Audit all log statements for proper levels (debug/info/warn/error/fatal). Some info logs might be better as debug. Ensure errors include stack traces where relevant. Identify possible improvements to align with Elastic ECS forms.

## Kibana Dashboard Features (Optional Enhancements)

- API Key Authentication - Add support for Elasticsearch API keys as an alternative to basic auth for dashboard export/import. Would allow more granular permissions and better security for automation scenarios.

## OpenTelemetry (Optional Enhancements)

- Testing Infrastructure - Add `@elastic/mockotlpserver` to dev dependencies and create integration test that verifies telemetry export. Helps validate instrumentation during development without full collector setup.

- Kibana Integration Guide - Document detailed steps to install OTel integrations in Kibana (APM, System OpenTelemetry Assets) and create data views for `traces-*`, `metrics-*`, `logs-*` indices. Add verification steps (APM → Services UI, Dashboards). Could be added to README or separate KIBANA-SETUP.md.

- Performance Tuning Documentation - Add example configuration for production batch processing (`OTEL_BSP_SCHEDULE_DELAY`, `OTEL_BSP_MAX_EXPORT_BATCH_SIZE`) and sampling settings. Current setup uses defaults which may not be optimal for high-volume deployments.

- Docker Healthchecks - Add healthcheck to docker-compose.otel.yml to verify collector OTLP endpoints (4317/4318) are ready before app starts. Prevents startup race conditions when running `yarn otel:collector:start && yarn poll` in quick succession.
