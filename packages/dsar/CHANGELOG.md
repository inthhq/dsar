# dsar

## 1.0.0

### Major Changes

- 364dfa2: Require Node.js 24 and update the runtime to TypeScript 7, Effect 4 beta.101,
  and the latest supported integration dependencies.

  Expand the persistence-backed Chat SDK state adapter with durable transcript
  lists, message queues, and force-unlock support required by Chat SDK 4.34.

- 0fc6cac: # Remove unsupported `dsar/adapter-c15t` export

  Remove the unsupported `dsar/adapter-c15t` export from the umbrella package.

  The repo no longer ships the private `@dsar/adapter-c15t` workspace package, and
  the example runtime config now uses the inbound stub until a supported inbound
  integration is configured.

### Minor Changes

- 7368f0d: Fail closed in the Unkey bearer resolver when key verification throws, treating provider errors and unreachable Unkey hosts as unauthenticated instead of surfacing provider exceptions, and add an optional `onVerifyError` hook so hosts can log or emit metrics for thrown verification failures.
- 092aa96: Add a `dsar doctor` diagnostics command with config, runtime reachability, auth, migration freshness, and adapter health checks backed by a new operator-scoped `GET /status/diagnostics` endpoint and `client.diagnostics()` Node SDK method, plus command help snapshots and grouped `--help` output.
- 21b314f: Add outbound webhook dispatch recovery: typed Node SDK methods and `GET /webhooks/dispatches` listing with filters, single and bulk replay endpoints with idempotent audit-logged replays, and `dsar webhooks list`, `dsar webhooks replay`, `dsar webhooks replay-all`, and `dsar webhooks tail` CLI commands.
- 38712ea: # Webhook receiver middleware exports

  Add webhook receiver APIs for the Node SDK, including HMAC verification, typed dispatch, initial handler maps, `sdk.webhooks.receiver()`, and Express, Hono, and Next.js middleware exports.

### Patch Changes

- 6217a46: Add refused request appeal overturn handling and backend E2E coverage for the full appeal-to-fulfilment lifecycle.

## 0.0.4

### Patch Changes

- License update and documentation improvements.
