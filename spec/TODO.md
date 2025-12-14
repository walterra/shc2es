# TODO

## Code Quality

- Type Safety for Saved Objects - Strengthen TypeScript types for saved objects. Currently using unknown and any in several places. Define proper interfaces for Kibana saved object API responses

- Logging Consistency Audit - Audit all log statements for proper levels (debug/info/warn/error/fatal). Some info logs might be better as debug. Ensure errors include stack traces where relevant. Identify possible improvements to align with Elastic ECS forms.

## Kibana Dashboard Features (Optional Enhancements)

- API Key Authentication - Add support for Elasticsearch API keys as an alternative to basic auth for dashboard export/import. Would allow more granular permissions and better security for automation scenarios.
