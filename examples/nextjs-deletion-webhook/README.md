# Next.js Deletion Webhook Quickstart

A production-ready Next.js App Router quickstart demonstrating how to receive outbound DSAR deletion webhooks using `@dsar/node-sdk/webhooks/next`.

## Quickstart in 5 Steps

### 1. Clone & Install

```bash
bun install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

### 3. Inspect Route Handler

The Next.js App Router POST route handler lives in [`app/api/webhooks/dsar/route.ts`](app/api/webhooks/dsar/route.ts):

```typescript
import { createWebhookReceiver } from "@dsar/node-sdk/webhooks";
import { nextWebhookHandler } from "@dsar/node-sdk/webhooks/next";
import { deleteDemoUserByEmail } from "../../../../lib/db";

const receiver = createWebhookReceiver({
  signingSecret: process.env.DSAR_WEBHOOK_SECRET!,
});

receiver.on("request_captured", (event) => {
  deleteDemoUserByEmail(event.payload.email as string);
});

export const POST = nextWebhookHandler(receiver);
```

### 4. Start Dev Server

```bash
bun run dev
```

### 5. Run Smoke Test

Run the automated end-to-end verification script:

```bash
bun run smoke
```

---

## Deploying to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Finthhq%2Fdsar%2Ftree%2Fmain%2Fexamples%2Fnextjs-deletion-webhook&env=DSAR_WEBHOOK_SECRET)

1. Click the button above to clone and deploy to Vercel.
2. Set `DSAR_WEBHOOK_SECRET` in your Vercel Environment Variables.
3. Configure your DSAR Webhook Endpoint URL to point at `https://your-domain.vercel.app/api/webhooks/dsar`.
