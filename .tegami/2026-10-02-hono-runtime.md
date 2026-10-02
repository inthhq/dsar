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
  stops the `runWebhookRetryWorker` loop and releases the instance. On a
  tenant-bound instance, both drain only that tenant's retries.
- `trustedOrigins` adds CORS headers to preflights and responses. Named
  origins get credentials; `*` gets a literal `*` without credentials.
- `observability` logs one evlog wide event per request, with PII redaction
  on. By default it leaves the host's evlog configuration alone and keeps
  failed and rejected requests through its sampling; `level` opts in to DSAR
  configuring evlog. Events carry no request bodies, and 4xx events carry no
  error messages or stacks. Errors no longer print a JSON line with
  `console.error`.

Downloaded artifacts now arrive byte for byte. Before, the response was
decoded as text, which corrupted binary files such as PDFs and archives.
