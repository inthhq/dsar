import { defineDocsConfig } from "leadtype";

export default defineDocsConfig({
	groups: [
		{
			description:
				"Onboarding, lifecycle walkthroughs, deployments, and build metrics.",
			slug: "guides",
			title: "Guides",
		},
		{
			description:
				"Runtime boundaries, contracts, versioning, and package layout.",
			slug: "architecture",
			title: "Architecture",
		},
		{
			children: [
				{
					description: "Email and chat sources that capture DSAR requests.",
					slug: "integrations-inbound",
					title: "Inbound",
				},
				{
					description: "Delivery channels for subject responses.",
					slug: "integrations-outbound",
					title: "Outbound",
				},
				{
					description: "Backed-up storage adapters for export artifacts.",
					slug: "integrations-storage",
					title: "Storage",
				},
				{
					description:
						"Shared rate-limit stores for public intake endpoints (Redis, Upstash).",
					slug: "integrations-rate-limit",
					title: "Rate Limit",
				},
				{
					description: "Bearer-token issuance and trusted identity adapters.",
					slug: "integrations-auth",
					title: "Auth",
				},
			],
			description:
				"Inbound channels, outbound delivery, storage adapters, and auth providers.",
			slug: "integrations",
			title: "Integrations",
		},
		{
			children: [
				{ slug: "reference-api", title: "API" },
				{ slug: "reference-developer", title: "Developer" },
				{ slug: "reference-persistence", title: "Persistence" },
				{ slug: "reference-storage", title: "Storage" },
				{ slug: "reference-testing", title: "Testing" },
				{ slug: "reference-errors", title: "Errors" },
			],
			description:
				"API, developer tooling, persistence, storage, testing, and error catalog.",
			slug: "reference",
			title: "Reference",
		},
	],
	llms: {
		sections: [
			{
				body: [
					"- Self-hostable runtime with tenant-safe persistence and storage adapters.",
					"- OpenAPI generated at GET /spec.json with interactive docs at GET /docs.",
					"- Inbound channels (Resend, Slack) and outbound delivery wired through the same lifecycle.",
					"- Auth split between machine bearer tokens and trusted-host identity projection.",
				].join("\n"),
				heading: "Overview",
				type: "markdown",
			},
			{
				heading: "Best Starting Points",
				links: [
					{
						description:
							"Stand up the runtime and walk through your first request.",
						title: "Getting Started",
						urlPath: "/docs/guides/getting-started",
					},
					{
						description: "How machine and trusted-host identity lanes work.",
						title: "Auth Model",
						urlPath: "/docs/architecture/auth-model",
					},
					{
						description: "Core DSAR request lifecycle endpoints.",
						title: "Requests API",
						urlPath: "/docs/reference/api/requests",
					},
				],
				type: "links",
			},
			{
				body: "Start with the getting started guide for a runnable local runtime, then use the architecture docs to understand contracts and the API reference for endpoint-level behavior.",
				heading: "Agent Guidance",
				type: "markdown",
			},
		],
	},
	navigation: [
		"index",
		{
			base: "guides",
			description:
				"Onboarding, lifecycle walkthroughs, deployments, and build metrics.",
			pages: [
				"index",
				"getting-started",
				"request-lifecycle",
				"examples-and-deployment",
				"package-build-metrics",
			],
			title: "Guides",
		},
		{
			base: "architecture",
			description:
				"Runtime boundaries, contracts, versioning, and package layout.",
			pages: [
				"index",
				"auth-model",
				"backend-runtime-core",
				"api-contract-surface",
				"adapter-contracts",
				"tenant-safe-persistence",
				"policy-pack-spec",
				"policy-versioning-and-upgrades",
				"contracts-and-versioning",
				"error-codes",
				"monorepo-packages",
				"workspace-validation",
			],
			title: "Architecture",
		},
		{
			base: "integrations",
			children: [
				{
					base: "inbound",
					description: "Email and chat sources that capture DSAR requests.",
					pages: ["index", "resend", "slack"],
					title: "Inbound",
				},
				{
					base: "outbound",
					description: "Delivery channels for subject responses.",
					pages: ["resend"],
					title: "Outbound",
				},
				{
					base: "storage",
					description: "Backed-up storage adapters for export artifacts.",
					pages: ["filesystem", "s3", "vercel-blob"],
					title: "Storage",
				},
				{
					base: "rate-limit",
					description:
						"Shared rate-limit stores for public intake endpoints (Redis, Upstash).",
					pages: ["redis", "upstash"],
					title: "Rate Limit",
				},
				{
					base: "auth",
					description: "Bearer-token issuance and trusted identity adapters.",
					pages: ["unkey"],
					title: "Auth",
				},
			],
			description:
				"Inbound channels, outbound delivery, storage adapters, and auth providers.",
			pages: ["index"],
			title: "Integrations",
		},
		{
			base: "reference",
			children: [
				{
					base: "api",
					pages: [
						"index",
						"status",
						"init",
						"requests",
						"verification",
						"manifest",
						"delivery",
						"appeals",
						"audit",
						"subjects",
						"retention",
						"policies",
						"webhooks",
					],
					title: "API",
				},
				{
					base: "developer",
					pages: ["sdk-and-runtime", "cli", "tsdoc"],
					title: "Developer",
				},
				{
					base: "persistence",
					pages: ["index", "sqlite", "pg"],
					title: "Persistence",
				},
				{
					base: "storage",
					pages: ["index", "filesystem", "s3", "vercel-blob"],
					title: "Storage",
				},
				{
					base: "testing",
					pages: ["acceptance-and-parity"],
					title: "Testing",
				},
				{
					base: "errors",
					pages: [{ include: "*", sort: ["path"] }],
					title: "Errors",
				},
			],
			description:
				"API, developer tooling, persistence, storage, testing, and error catalog.",
			pages: ["index"],
			title: "Reference",
		},
	],
	organization: {
		name: "DSAR",
	},
	product: {
		category: "DeveloperApplication",
		kind: "library",
		name: "DSAR",
		repository: "https://github.com/inthhq/dsar",
		tagline:
			"Developer-first Data Subject Access Request engine: APIs, SDK, lifecycle, policy, and webhooks.",
	},
});
