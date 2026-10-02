---
packages:
  dsar: minor
---

### Host DSAR inline: tenant binding, serverless retries, and evlog

`dsarInstance` now routes requests with Hono and accepts options for hosts
that serve DSAR inside an existing app or gateway:

- `tenantId` binds an instance to one tenant. Credentials scoped to another
  tenant get a `403`, credentials without a tenant act for it, and inbound
  adapters cannot capture into another tenant. `requireTenantId` refuses to
  build an instance without one.
- `runWebhookRetries()` delivers the webhook retries that are due and returns,
  so serverless hosts can drain retries from a scheduled job. `dispose()`
  stops the `runWebhookRetryWorker` loop and releases the instance.
- `trustedOrigins` answers CORS preflights and adds CORS headers for the
  listed origins.
- `observability` logs one evlog wide event per request. By default only
  failed and rejected requests are logged, with PII redaction on. Errors no
  longer print a JSON line with `console.error`.

Downloaded artifacts now arrive byte for byte. Before, the response was
decoded as text, which corrupted binary files such as PDFs and archives.
