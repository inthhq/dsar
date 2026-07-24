import { defineConfig } from "tsdown";

export default defineConfig({
	attw: { enabled: "ci-only", profile: "esm-only" },
	clean: true,
	deps: {
		alwaysBundle: ["@dsar/cli"],
		dts: {
			neverBundle: [/^@dsar\//],
		},
		neverBundle: [/^@effect\//, "dotenv", "effect"],
	},
	dts: {
		generator: "tsgo",
	},
	entry: {
		"auth-unkey": "src/auth-unkey.ts",
		backend: "src/backend.ts",
		bin: "src/bin.ts",
		cli: "src/cli.ts",
		core: "src/core.ts",
		"inbound-resend": "src/inbound-resend.ts",
		"inbound-slack": "src/inbound-slack.ts",
		index: "src/index.ts",
		"node-sdk": "src/node-sdk.ts",
		"node-sdk-webhooks": "src/node-sdk-webhooks.ts",
		"node-sdk-webhooks-express": "src/node-sdk-webhooks-express.ts",
		"node-sdk-webhooks-hono": "src/node-sdk-webhooks-hono.ts",
		"node-sdk-webhooks-next": "src/node-sdk-webhooks-next.ts",
		"outbound-resend": "src/outbound-resend.ts",
		"persistence-pg": "src/persistence-pg.ts",
		"persistence-sqlite": "src/persistence-sqlite.ts",
		redis: "src/redis.ts",
		"storage-filesystem": "src/storage-filesystem.ts",
		"storage-s3": "src/storage-s3.ts",
		"storage-vercel-blob": "src/storage-vercel-blob.ts",
		upstash: "src/upstash.ts",
	},
	failOnWarn: "ci-only",
	fixedExtension: true,
	format: "esm",
	publint: "ci-only",
	suppressWarnings: [
		"TypeScript 7.0 does not yet have a stable API and is experimental. Some options will be unavailable.",
	],
});
