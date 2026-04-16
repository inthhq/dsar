# @dsar/inbound-slack

Slack inbound webhook adapter for DSAR intake. It verifies Slack signatures, normalizes supported Slack surfaces into DSAR capture payloads, and can enrich conversational events with Chat SDK message snapshots.

## Installation

```sh
npm install @dsar/inbound-slack
```

```sh
yarn add @dsar/inbound-slack
```

## Configuration

Required environment variables:

- `SLACK_SIGNING_SECRET`: Slack app signing secret used to validate inbound webhooks.

Optional environment variables:

- `SLACK_BOT_TOKEN`: Bot token used for profile lookup and Chat SDK parsing.
- `SLACK_BOT_USERNAME`: Bot username passed to the Chat SDK Slack adapter. Defaults to `dsar-bot`.
- `SLACK_REPLAY_TOLERANCE_SECONDS`: Maximum allowed age for signed requests. Defaults to `300`.
- `SLACK_DEDUPE_TTL_MS`: Chat SDK dedupe window used during message parsing. Defaults to `300000`.

Example:

```sh
export SLACK_SIGNING_SECRET="whsec_..."
export SLACK_BOT_TOKEN="xoxb-..."
export SLACK_BOT_USERNAME="dsar-bot"
```

## Setup

1. Create or configure a Slack app with the Events API enabled.
2. Point Slack to your DSAR webhook endpoint: `POST /webhooks/inbound/slack`.
3. Subscribe to the Slack surfaces you want to process, such as app mentions, DMs, slash commands, shortcuts, block actions, or modal submissions.
4. Install the app into the target workspace and capture the signing secret and bot token.
5. Trigger Slack's URL verification flow and confirm the DSAR endpoint echoes the `challenge` response with HTTP `200`.
6. Send a test event and verify normal webhook deliveries return HTTP `202` when accepted for capture or ignored as non-DSAR.

## Usage

Minimal adapter setup:

```ts
import { makeSlackInboundAdapter } from "@dsar/inbound-slack";

const inbound = makeSlackInboundAdapter({
	botToken: process.env.SLACK_BOT_TOKEN,
	signingSecret: process.env.SLACK_SIGNING_SECRET!,
	teamRoutes: {
		T123: {
			jurisdiction: "uk",
			tenantId: "tenant-a",
			channels: {
				CPRIVACY: {
					jurisdiction: "uk",
					tenantId: "tenant-a",
					workspaceId: "workspace-1",
				},
			},
			commands: {
				"/dsar": {
					jurisdiction: "uk",
					tenantId: "tenant-a",
				},
			},
		},
	},
	userName: process.env.SLACK_BOT_USERNAME,
});
```

Register the adapter in a DSAR runtime:

```ts
import { dsarInstance } from "@dsar/dsar";
import { makeSlackInboundAdapter } from "@dsar/inbound-slack";

const inbound = makeSlackInboundAdapter({
	signingSecret: process.env.SLACK_SIGNING_SECRET!,
});

const runtime = dsarInstance({
	adapters: {
		inbound,
		notifications: "stub",
		storage: "stub",
	},
});
```

Consumers that need config or chat helpers should import from concrete subpaths:

```ts
import { parseSlackInboundAdapterConfig } from "@dsar/inbound-slack/config";
import { makeSlackChatRuntime } from "@dsar/inbound-slack/chat";
import type { SlackInboundAdapterConfig } from "@dsar/inbound-slack/types";
```

## API Reference

Primary root export:

- `makeSlackInboundAdapter`: Creates the inbound adapter used by the backend webhook route.

Subpath exports:

- `@dsar/inbound-slack/config`: `defaultSlackInboundConfig`, `parseSlackInboundAdapterConfig`, and `SlackInboundAdapterConfigSchema`.
- `@dsar/inbound-slack/chat`: `makeSlackChatRuntime`, `makeSlackMessageParser`, `toSlackParsedMessageSnapshot`, and related runtime/parser types.
- `@dsar/inbound-slack/types`: Public adapter config, payload, requestor, route, and error types such as `SlackInboundAdapterConfig`, `SlackNormalizedInboundPayload`, `SlackUrlVerificationPayload`, and `SlackAdapterInvocationError`.
