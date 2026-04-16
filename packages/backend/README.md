# @dsar/backend

[GitHub stars](https://github.com/inthhq/dsar)
[CI](https://github.com/inthhq/dsar/actions/workflows/ci.yml)
[License](https://github.com/inthhq/dsar/blob/main/LICENSE.md)
[Discord](https://c15t.link/discord)
[npm version](https://www.npmjs.com/package/@c15t/react)
[Top Language](https://github.com/inthhq/dsar)
[Last Commit](https://github.com/inthhq/dsar/commits/main)
[Open Issues](https://github.com/inthhq/dsar/issues)

Backend runtime core for DSAR services. `dsarInstance(options)` returns handler, app metadata, and runtime context; built on @effect/platform HTTP boundary with fetch-compatible contract.

## Table of Contents

- [Key Features](#key-features)
- [Usage](#usage)
- [Support](#support)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Key Features

- Route groups: /init, /requests, /subjects, /policies, /status
- Error envelope: non-success responses return ok, error.code, error.message, status
- Persistence wiring via runtimeReposFromPersistence + @dsar/persistence
- OpenAPI + docs: GET /spec.json, GET /docs, makeDsarHttpApi, createOpenApiSpec
- Auth lanes: bearer-backed machine access plus trusted host identity projection
- Authorization: principal-kind checks, tenant enforcement, and subject-ownership guards

## Usage

```ts
import { dsarInstance } from "@dsar/backend";

const runtime = dsarInstance({ basePath: "/api/v1" });

export default {
	async fetch(request: Request): Promise<Response> {
		return runtime.handler(request);
	},
};
```

1. Persistence wiring:

```ts
import { dsarInstance, runtimeReposFromPersistence } from "@dsar/backend";
import { Effect } from "effect";
import {
	makeSqlitePersistenceLayer,
	Persistence,
	withTenant,
} from "@dsar/persistence";

const persistence = await Effect.runPromise(
	Persistence.pipe(
		withTenant("tenant-1"),
		Effect.provide(makeSqlitePersistenceLayer({ filename: ":memory:" }))
	)
);

const runtime = dsarInstance({
	repos: runtimeReposFromPersistence(persistence),
});
```

1. OpenAPI spec and docs: `GET /spec.json`, `GET /docs` (basePath-aware).

## Auth Configuration

Use `auth.staticBearerTokens` or `auth.resolveBearerToken` for machine callers such as CLI, SDKs, automation, and service-to-service traffic.

Use `auth.resolveTrustedRequestIdentity` when the host product already authenticated the subject or operator and wants to project that identity into DSAR without handing DSAR credentials to the browser.

Protected routes now distinguish `operator`, `service`, and `subject` principals. Subject principals are limited to subject-owned routes and must match the requested record or profile.

See:

- `docs/architecture/auth-model.md`
- `docs/integrations/unkey.md`
- `docs/errors/dsar-be-1003.md`

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

**Built with 💛 by the [inth.com](https://www.inth.com?utm_source=github&utm_medium=repopage_%40dsar%2Fbackend) team**
