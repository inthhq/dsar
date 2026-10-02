## dsar@1.0.0

### Webhook receiver middleware exports

Add webhook receiver APIs for the Node SDK, including HMAC verification, typed dispatch, initial handler maps, `sdk.webhooks.receiver()`, and Express, Hono, and Next.js middleware exports.

### List and replay outbound webhook dispatches

Add outbound webhook dispatch recovery: typed Node SDK methods and `GET /webhooks/dispatches` listing with filters, single and bulk replay endpoints with idempotent audit-logged replays, and `dsar webhooks list`, `dsar webhooks replay`, `dsar webhooks replay-all`, and `dsar webhooks tail` CLI commands.

### Retry outbound webhooks on a durable schedule

Outbound webhook delivery writes a pending attempt before send, retries on a durable 1m/5m/30m/2h/6h/24h schedule after the request returns, marks exhausted jobs `dead`, and appends a request timeline event for each attempt. Pass `runWebhookRetryWorker: true` to `dsarInstance` (kitchen-sink does) so due jobs keep draining after the HTTP request returns.

### Overturn refused requests on appeal

Add refused request appeal overturn handling and backend E2E coverage for the full appeal-to-fulfilment lifecycle.

### Keep Node SDK failures on their catalog codes

Keep Node SDK HTTP and envelope failures on their catalog codes. The fetcher previously treated thrown `DsarSdkError` instances as transport failures because `isSdkError` only accepted plain objects.

### Fix error `docsUrl` links

Point error `docsUrl` links at `https://dsar-sdk.dev/docs/reference/errors/<slug>`, where the error reference pages are published. The previous `https://dsar-sdk.dev/errors` base returned 404 for every error.

### Add `dsar/react` portal widgets

Add `dsar/react` with a subject portal, an operator queue, a hosted inth.app transport, and local SQLite portal examples. The widgets are alpha.

### Alert on dead webhooks and add DLQ commands

Add a tenant-scoped `onDeadWebhook` alert when outbound webhook jobs exhaust retries, and operator DLQ commands `dsar webhooks dlq list` and `dsar webhooks dlq replay` over dead `notification_delivery_attempts` rows. Bulk replay now accepts `status=dead`.

### Install `dsar` from npm without unpublished dependencies

`dsar@0.0.5` depended on `@dsar/*` workspace packages that were never
published, so `npm install dsar` failed. `dsar` now bundles that code and is
the only package you install.

Libraries an adapter needs are optional peer dependencies. Install the ones
for the subpaths you import, for example `@effect/sql-pg` for
`dsar/persistence-pg`, `@aws-sdk/client-s3` for `dsar/storage-s3`, or `react`
for `dsar/react`. `effect` is a required peer.

The Chat SDK state adapter, `makePersistenceStateAdapter`, moves from the root
`dsar` entry to `dsar/chat`, so the root entry typechecks without `chat`
installed.

### Fail closed when Unkey verification throws

Fail closed in the Unkey bearer resolver when key verification throws, treating provider errors and unreachable Unkey hosts as unauthenticated instead of surfacing provider exceptions, and add an optional `onVerifyError` hook so hosts can log or emit metrics for thrown verification failures.

### Remove unsupported `dsar/adapter-c15t` export

Remove the unsupported `dsar/adapter-c15t` export from the umbrella package.

The repo no longer ships the private `@dsar/adapter-c15t` workspace package, and
the example runtime config now uses the inbound stub until a supported inbound
integration is configured.

### Add `dsar doctor` and `GET /status/diagnostics`

Add a `dsar doctor` diagnostics command with config, runtime reachability, auth, migration freshness, and adapter health checks backed by a new operator-scoped `GET /status/diagnostics` endpoint and `client.diagnostics()` Node SDK method, plus command help snapshots and grouped `--help` output.

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

### Return 400s for malformed intake bodies

Validate create and capture request bodies with IntakePayloadSchema so malformed JSON and schema failures return catalog 400s instead of 500s. Tenant and actor identity still come from request context.

### Complete policy upgrades over HTTP

Declare the policy-upgrade propose body (`fromVersion`, `tenantId`, `toVersion`) in OpenAPI, and keep propose/approve/apply state for the life of a backend runtime instance so HTTP upgrades can complete.

### Add `dsar/persistence` and `dsar/react/styles.css`

`dsar/persistence` exports the persistence contract the driver layers need,
including `Persistence`, `withTenant`, and `TenantContext`, so Effect
applications can compose `makePgPersistenceLayer` and
`makeSqlitePersistenceLayer` without a private package.

`dsar/react/styles.css` ships the stylesheet for the React widgets, and
`dsar/react` keeps its `"use client"` directive so Next.js server components
can render the widgets.

### Require Node.js 24, TypeScript 7, and Effect 4

Require Node.js 24 and update the runtime to TypeScript 7, Effect 4.0.0,
and the latest supported integration dependencies.

Expand the persistence-backed Chat SDK state adapter with durable transcript
lists, message queues, and force-unlock support required by Chat SDK 4.34.

Migration steps for 0.0.5 to 1.0.0 live in docs/guides/upgrading.mdx.

# dsar

Migration steps for 0.0.5 to 1.0.0 live in docs/guides/upgrading.mdx.

## 0.0.4

### Patch Changes

- License update and documentation improvements.
