# Kitchen Sink Runtime Example

Runnable DSAR example with SQLite persistence, filesystem artifact storage, and
a broad walkthrough script that exercises the main lifecycle endpoints.

## Quick Start

1. Copy `.env.example` to `.env`.
2. Use the shared local example secrets from `.env.example`:
   `DSAR_ADMIN_API_TOKEN=dsar_admin_local_dev_token` for admin flows.
3. Start the runtime:

```sh
turbo run dev --filter=dsar-kitchen-sink-example
```

1. In another terminal, run the walkthrough:

```sh
turbo run kitchen-sink --filter=dsar-kitchen-sink-example
```

## Notes

- The local runtime defaults to `http://kitchen-sink.localhost:1355`.
- `DSAR_API_TOKEN` remains the simplest self-hosted setup: one tenant-scoped
  machine key for CLI, SDK, or automation.
- `UNKEY_ROOT_KEY` is optional. When present, `runtime.config.ts` wires
  `@dsar/auth-unkey` into `resolveBearerToken` for hosted-style API key
  verification.
- Runtime defaults are local-only: `PORT=3021`, `.dsar-kitchen-sink.db`, and
  `.dsar-kitchen-sink-artifacts`.
- `runtime.config.ts` wires filesystem storage plus inbound/outbound Resend
  adapters with development-safe defaults.
- Outbound Resend is mock-delivered by default with
  `DSAR_OUTBOUND_RESEND_LIVE=false`.
- `smoke` and `kitchen-sink` run the same walkthrough script.
