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
	product: {
		bestStartingPoints: [
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
		bullets: [
			"Self-hostable runtime with tenant-safe persistence and storage adapters.",
			"OpenAPI generated at GET /spec.json with interactive docs at GET /docs.",
			"Inbound channels (Resend, Slack) and outbound delivery wired through the same lifecycle.",
			"Auth split between machine bearer tokens and trusted-host identity projection.",
		],
		name: "DSAR",
		summary:
			"Developer-first Data Subject Access Request engine: APIs, SDK, lifecycle, policy, and webhooks.",
	},
});
