# Next.js deletion webhook quickstart

This Next.js App Router example receives a signed outbound DSAR webhook,
deletes the SQLite user linked to its verified `requestId`, writes an audit
record, and returns `{ "ok": true }`.

## Quickstart in 5 steps

### 1. Install the workspace

From the repository root:

```bash
bun install
```

### 2. Configure the webhook secret

```bash
cd examples/nextjs-deletion-webhook
cp .env.example .env
openssl rand -hex 32
```

Paste the generated value after `DSAR_WEBHOOK_SECRET=` in `.env`. Configure the
same value on the DSAR outbound webhook endpoint.

### 3. Inspect the deletion flow

[`app/api/webhooks/dsar/route.ts`](app/api/webhooks/dsar/route.ts) verifies the
signature and handles `request_captured`. The app associates its own user row
with the DSAR request ID when the request is created, so the webhook does not
need to carry personal data in `payload`.

[`lib/db.ts`](lib/db.ts) deletes that row and writes the event ID, request ID,
idempotency key, policy version, locale, result, and processing time to SQLite
in one transaction. Repeated delivery of the same event returns the recorded
result without deleting or auditing twice.

### 4. Start Next.js

```bash
bun run dev
```

The webhook route is `POST /api/webhooks/dsar`.

### 5. Run the smoke test

```bash
bun run smoke
```

The test creates a temporary SQLite database, sends the same signed webhook
twice through the exported Next.js route, and checks the acknowledgement,
deletion, audit metadata, and idempotency. `bun run test` runs the same path in
CI through Vitest.

## Deploy to Vercel

[Create a Vercel project from this repository](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Finthhq%2Fdsar) and then:

1. Set the Root Directory to `examples/nextjs-deletion-webhook`.
2. Add `DSAR_WEBHOOK_SECRET` with the secret configured in DSAR.
3. Add `DEMO_DATABASE_PATH=/tmp/dsar-demo.sqlite`.
4. Point the DSAR webhook endpoint at
   `https://your-domain.vercel.app/api/webhooks/dsar`.

Vercel's `/tmp` filesystem is ephemeral. It is enough to try this example, but
it is not durable application storage. Replace `lib/db.ts` with your managed
database adapter before using this flow in production.
