# @dsar/core

[GitHub stars](https://github.com/inthhq/dsar)
[CI](https://github.com/inthhq/dsar/actions/workflows/ci.yml)
[License](https://github.com/inthhq/dsar/blob/main/LICENSE.md)
[Discord](https://c15t.link/discord)
[npm version](https://www.npmjs.com/package/@c15t/react)
[Top Language](https://github.com/inthhq/dsar)
[Last Commit](https://github.com/inthhq/dsar/commits/main)
[Open Issues](https://github.com/inthhq/dsar/issues)

Mode-aware DSAR client runtime. Provides one stable application-facing contract and swaps runtime behavior by mode: managed, self-hosted, custom, offline.

## Table of Contents

- [Key Features](#key-features)
- [Usage](#usage)
- [Support](#support)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Key Features

- Modes: managed, self-hosted, custom, offline
- Tenant AI optionality via `aiEnabled` in config
- Client creation: `buildCoreClient` creates fresh instances; use `CoreClientFactoryCached` for Effect-based caching

## Usage

```ts
import { buildCoreClient } from "@dsar/core";
```

1. ### managed / self-hosted

Use HTTP-backed execution via `@dsar/node-sdk` with `baseUrl` (or `DSAR_API_URL`).
`token` / `DSAR_API_TOKEN` is the machine-access credential for managed or
self-hosted DSAR, not a browser-distributed subject login token.

```ts
const client = buildCoreClient({
	mode: "managed",
	baseUrl: "https://api.example.com/api/v1",
	token: process.env.DSAR_API_TOKEN,
});

const status = await client.sdk.status();
console.log(status.unwrap().status);
```

1. ### custom

Provide a handler for deterministic/custom routing.

```ts
const client = buildCoreClient({
	mode: "custom",
	handler: async ({ path }) => {
		if (path.join(".") === "status") {
			return { service: "custom", status: "ok" };
		}
		return { status: "stubbed" };
	},
});
```

1. ### offline

Use deterministic local fixtures without backend dependency.

```ts
const client = buildCoreClient({
	mode: "offline",
	fixtures: {
		status: { service: "offline", status: "ok" },
	},
});
```

1. For Effect-based caching, use `CoreClientFactoryCached` with `CoreClientFactoryLive` (see `@dsar/core/service`).

## Support

- Join our [Discord community](https://c15t.link/discord)
- Open an issue on our [GitHub repository](https://github.com/inthhq/dsar/issues)
- Visit [inth.com](https://inth.com) and use the chat widget
- Contact our support team via email [support@inth.com](mailto:support@inth.com)

## Contributing

- We're open to all community contributions!
- Read our [Contribution Guidelines](https://c15t.com/docs/oss/contributing)
- Review our [Code of Conduct](https://c15t.com/docs/oss/code-of-conduct)
- Fork the repository
- Create a new branch for your feature
- Submit a pull request
- **All contributions, big or small, are welcome and appreciated!**

## Security

If you believe you have found a security vulnerability in c15t, we encourage you to **_responsibly disclose this and NOT open a public issue_**. We will investigate all legitimate reports.

Our preference is that you make use of GitHub's private vulnerability reporting feature to disclose potential security vulnerabilities in our Open Source Software. To do this, please visit [https://github.com/inthhq/dsar/security](https://github.com/inthhq/dsar/security) and click the "Report a vulnerability" button.

### Security Policy

- Please do not share security vulnerabilities in public forums, issues, or pull requests
- Provide detailed information about the potential vulnerability
- Allow reasonable time for us to address the issue before any public disclosure
- We are committed to addressing security concerns promptly and transparently

## License

[Apache License 2.0](https://github.com/inthhq/dsar/blob/main/LICENSE.md)

---

**Built with 💛 by the [inth.com](https://www.inth.com?utm_source=github&utm_medium=repopage_%40dsar%2Fcore) team**
