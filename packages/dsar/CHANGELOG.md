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

- 38712ea: # Webhook receiver middleware exports

  Add webhook receiver middleware exports for the Node SDK, including HMAC verification, typed receiver dispatch, and Express, Hono, and Next.js adapter subpaths.

### Patch Changes

- 6217a46: Add refused request appeal overturn handling and backend E2E coverage for the full appeal-to-fulfilment lifecycle.

## 0.0.4

### Patch Changes

- License update and documentation improvements.
