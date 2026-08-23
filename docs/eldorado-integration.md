# Eldorado integration

`EldoradoAdapter` is a feature-flagged stub (`ELDORADO_ENABLED`). Official seller API access requires 50+ completed sales. **Do not invent endpoint paths or request bodies.**

## Obtain before implementing

- Official seller API base URL
- Auth method (key, OAuth, cookie)
- Publish / update / cancel listing request and response schemas
- Order webhook or poll contract
- Mark-fulfilled contract
- Sandbox vs production hosts
- Rate limits and listing field limits (title length, images)

Until those are in hand, use `ManualExportAdapter` (CSV / XLSX / copy) or `MockAdapter`.
