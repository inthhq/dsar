# dsar

## 1.0.0

### Major Changes

- 364dfa2: Require Node.js 24 and update the runtime to TypeScript 7, Effect 4 beta.101,
  and the latest supported integration dependencies.

  Expand the persistence-backed Chat SDK state adapter with durable transcript
  lists, message queues, and force-unlock support required by Chat SDK 4.34.

  Migration steps for 0.0.5 to 1.0.0 live in docs/guides/upgrading.mdx.

- 0fc6cac: # Remove unsupported `dsar/adapter-c15t` export

  Remove the unsupported `dsar/adapter-c15t` export from the umbrella package.

  The repo no longer ships the private `@dsar/adapter-c15t` workspace package, and
  the example runtime config now uses the inbound stub until a supported inbound
  integration is configured.

### Minor Changes

- 7368f0d: Fail closed in the Unkey bearer resolver when key verification throws, treating provider errors and unreachable Unkey hosts as unauthenticated instead of surfacing provider exceptions, and add an optional `onVerifyError` hook so hosts can log or emit metrics for thrown verification failures.
- 092aa96: Add a `dsar doctor` diagnostics command with config, runtime reachability, auth, migration freshness, and adapter health checks backed by a new operator-scoped `GET /status/diagnostics` endpoint and `client.diagnostics()` Node SDK method, plus command help snapshots and grouped `--help` output.
- 21b314f: Add outbound webhook dispatch recovery: typed Node SDK methods and `GET /webhooks/dispatches` listing with filters, single and bulk replay endpoints with idempotent audit-logged replays, and `dsar webhooks list`, `dsar webhooks replay`, `dsar webhooks replay-all`, and `dsar webhooks tail` CLI commands.
- b2824fc: Add a tenant-scoped `onDeadWebhook` alert when outbound webhook jobs exhaust retries, and operator DLQ commands `dsar webhooks dlq list` and `dsar webhooks dlq replay` over dead `notification_delivery_attempts` rows. Bulk replay now accepts `status=dead`.
- 38712ea: # Webhook receiver middleware exports

  Add webhook receiver APIs for the Node SDK, including HMAC verification, typed dispatch, initial handler maps, `sdk.webhooks.receiver()`, and Express, Hono, and Next.js middleware exports.

- 052a59e: Outbound webhook delivery writes a pending attempt before send, retries on a durable 1m/5m/30m/2h/6h/24h schedule after the request returns, marks exhausted jobs `dead`, and appends a request timeline event for each attempt. Pass `runWebhookRetryWorker: true` to `dsarInstance` (kitchen-sink does) so due jobs keep draining after the HTTP request returns.

### Patch Changes

- 6217a46: Add refused request appeal overturn handling and backend E2E coverage for the full appeal-to-fulfilment lifecycle.
- 8332591: Point error `docsUrl` links at `https://dsar-sdk.dev/docs/reference/errors/<slug>`, where the error reference pages are published. The previous `https://dsar-sdk.dev/errors` base returned 404 for every error.
- d2307b2: Validate create and capture request bodies with IntakePayloadSchema so malformed JSON and schema failures return catalog 400s instead of 500s. Tenant and actor identity still come from request context.
- 556d3a0: Declare the policy-upgrade propose body (`fromVersion`, `tenantId`, `toVersion`) in OpenAPI, and keep propose/approve/apply state for the life of a backend runtime instance so HTTP upgrades can complete.
- 026b104: Add `@dsar/react` with hosted inth.app transport and local SQLite portal examples. Alpha 0.0.6 UI kit. Does not change the engine 1.0.0 major.
- 7f284f6: Keep Node SDK HTTP and envelope failures on their catalog codes. The fetcher previously treated thrown `DsarSdkError` instances as transport failures because `isSdkError` only accepted plain objects.

Migration steps for 0.0.5 to 1.0.0 live in docs/guides/upgrading.mdx.

## 0.0.4

### Patch Changes

- License update and documentation improvements.
