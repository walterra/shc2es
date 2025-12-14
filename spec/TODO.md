# TODO

## Code Quality

- Type Safety for Saved Objects - Strengthen TypeScript types for saved objects. Currently using unknown and any in several places. Define proper interfaces for Kibana saved object API responses

- Logging Consistency Audit - Audit all log statements for proper levels (debug/info/warn/error/fatal). Some info logs might be better as debug. Ensure errors include stack traces where relevant. Identify possible improvements to align with Elastic ECS forms.

- Configuration Validation - Add validation for environment variables. Check URL formats for ES_NODE and KIBANA_NODE, validate paths exist for ES_CA_CERT, provide helpful error messages for missing/invalid config
