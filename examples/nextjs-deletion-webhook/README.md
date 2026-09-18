# Next.js deletion webhook

This App Router example receives a signed outbound DSAR webhook, looks up a
demo user by `event.requestId`, and returns `{ "ok": true }`.

DSAR has no `deletion.requested` event. `request_captured` is intake, before
verification or refuse, so this app never deletes on capture. It deletes on
`request_fulfilled`, which is the lifecycle event emitted when fulfilment
completes.

The webhook payload does not include the subject email. The demo store keeps
email on its own rows and never reads `payload.email`.

The store is a JSON file (`node:fs`). It runs on Bun and Node. It is not a
production database.

## Setup

1. From the repository root, install workspace dependencies:

```sh
bun install
```

2. Copy the env file and set a signing secret:

```sh
cd examples/nextjs-deletion-webhook
cp .env.example .env
```

Put the same value in `DSAR_WEBHOOK_SECRET` here and on the DSAR outbound
webhook endpoint.

3. Run the smoke test:

```sh
bun run smoke
```

The test posts a signed capture (the user stays), a signed fulfilment (the user
is deleted), and a bad signature (401).

4. Start the App Router handler:

```sh
bun run dev
```

The route is `POST http://localhost:3000/api/webhooks/dsar`.

5. Point DSAR at that URL with the same signing secret.

## Deploy to Vercel

Create a Vercel project from this repository, then:

- Set the Root Directory to `examples/nextjs-deletion-webhook`.
- Add `DSAR_WEBHOOK_SECRET` with the secret configured in DSAR.
- Optionally set `DEMO_STORE_PATH=/tmp/dsar-demo-users.json`.
- Point the DSAR webhook endpoint at
  `https://your-domain.vercel.app/api/webhooks/dsar`.

Vercel `/tmp` is ephemeral. Replace `lib/store.ts` with your database before
using this flow in production.
