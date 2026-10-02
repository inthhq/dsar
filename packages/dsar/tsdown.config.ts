import { readFileSync } from "node:fs";

import { defineConfig } from "tsdown";

interface PackageManifest {
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly peerDependencies?: Readonly<Record<string, string>>;
}

const manifest = JSON.parse(
	readFileSync(new URL("package.json", import.meta.url), "utf8")
) as PackageManifest;

// `dsar` is the only published package. The `@dsar/*` workspaces are private
// source folders, so their code and declarations are bundled in. Everything
// else must be a declared dependency or peer, or the published tarball would
// import a package its consumers never installed.
const runtimeImports = Object.keys({
	...manifest.dependencies,
	...manifest.peerDependencies,
});

export default defineConfig({
	attw: { enabled: "ci-only", profile: "esm-only" },
	clean: true,
	deps: {
		alwaysBundle: [/^@dsar\//],
		// Workspace sources resolve to local files, so nothing from node_modules
		// may be bundled.
		onlyBundle: [],
		onlyImport: runtimeImports,
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
		react: "src/react.ts",
		redis: "src/redis.ts",
		"storage-filesystem": "src/storage-filesystem.ts",
		"storage-s3": "src/storage-s3.ts",
		"storage-vercel-blob": "src/storage-vercel-blob.ts",
		upstash: "src/upstash.ts",
	},
	failOnWarn: "ci-only",
	fixedExtension: true,
	format: "esm",
	platform: "node",
	publint: "ci-only",
	suppressWarnings: [
		"TypeScript 7.0 does not yet have a stable API and is experimental. Some options will be unavailable.",
	],
	// Covers the bundled workspace sources so tsgo emits their declarations.
	tsconfig: "../tsconfig.dsar-build.json",
});
