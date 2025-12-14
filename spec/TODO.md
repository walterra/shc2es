# TODO

## Code Quality

- Type Safety for Saved Objects - Strengthen TypeScript types for saved objects. Currently using unknown and any in several places. Define proper interfaces for Kibana saved object API responses

- Logging Consistency Audit - Audit all log statements for proper levels (debug/info/warn/error/fatal). Some info logs might be better as debug. Ensure errors include stack traces where relevant. Identify possible improvements to align with Elastic ECS forms.

## Kibana Dashboard Features (Optional Enhancements)

- API Key Authentication - Add support for Elasticsearch API keys as an alternative to basic auth for dashboard export/import. Would allow more granular permissions and better security for automation scenarios.

- Kibana Space Isolation - Add `space_id` parameter support to import/export dashboards to specific Kibana spaces. Useful for multi-tenant setups where different teams need isolated dashboards.

- Cross-version Compatibility Mode - Implement `compatibilityMode` parameter for dashboard imports to enable automatic cross-version adjustments when importing dashboards from different Kibana versions.

- Dashboard Copy Mode - Add `createNewCopies` parameter support to generate new IDs for all objects during import, allowing users to create copies of dashboards without conflicts.


