<p align="center">
  <a href="https://dsar-sdk.dev?utm_source=github&utm_medium=repopage_%40dsar%2Fpersistence" target="_blank" rel="noopener noreferrer">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/c15t-banner-readme-dark.svg" type="image/svg+xml">
      <img src="../../docs/assets/c15t-banner-readme-light.svg" alt="c15t Banner" type="image/svg+xml">
    </picture>
  </a>
  <br />
  <h1 align="center">@dsar/persistence</h1>
</p>

[![GitHub stars](https://img.shields.io/github/stars/inthhq/dsar?style=flat-square)](https://github.com/inthhq/dsar)
[![CI](https://img.shields.io/github/actions/workflow/status/inthhq/dsar/ci.yml?style=flat-square)](https://github.com/inthhq/dsar/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=flat-square)](https://github.com/inthhq/dsar/blob/main/LICENSE.md)
[![Discord](https://img.shields.io/discord/1312171102268690493?style=flat-square)](https://c15t.link/discord)
[![npm version](https://img.shields.io/npm/v/%40dsar%2Fpersistence?style=flat-square)](https://www.npmjs.com/package/@dsar/persistence)
[![Top Language](https://img.shields.io/github/languages/top/inthhq/dsar?style=flat-square)](https://github.com/inthhq/dsar)
[![Last Commit](https://img.shields.io/github/last-commit/inthhq/dsar?style=flat-square)](https://github.com/inthhq/dsar/commits/main)
[![Open Issues](https://img.shields.io/github/issues/inthhq/dsar?style=flat-square)](https://github.com/inthhq/dsar/issues)

Tenant-safe persistence layer for DSAR runtime services.

## Table of Contents

- [Key Features](#key-features)
- [Usage](#usage)
- [Support](#support)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Key Features

- Effect service contracts for tenant-scoped repositories.
- Fail-closed tenant guard behavior (no unscoped data access).
- Internal `makePersistenceLayer` composition helper used by the public
  driver-specific factories.
- Shared migration runner used by driver packages.
- Driver-specific layer factories now live in dedicated packages:
  - `@dsar/persistence-sqlite` for local development and integration tests
  - `@dsar/persistence-pg` for PostgreSQL-backed deployments
- Driver seams let runtimes switch databases without changing repository
  contracts.

## Usage

## Installation

`@dsar/persistence`, `@dsar/persistence-sqlite`, and `@dsar/persistence-pg` are
currently private workspace packages in this monorepo. They are intended for
workspace consumption from a local checkout rather than installation from the
public npm registry.

For local monorepo development, install workspace dependencies from the repo
root:

```sh
bun install
```

Then import the workspace packages directly in code:

- `@dsar/persistence` for the shared contracts and tenant context
- `@dsar/persistence-sqlite` for `makeSqlitePersistenceLayer`
- `@dsar/persistence-pg` for `makePgPersistenceLayer`

If these packages are published later, install the published package names that
provide the same imports before using the examples below.

Most application code should call `makeSqlitePersistenceLayer` or
`makePgPersistenceLayer` directly rather than wiring `makePersistenceLayer`
itself.

```ts
import { Effect } from "effect";
import { Persistence, withTenant } from "@dsar/persistence";
import { makeSqlitePersistenceLayer } from "@dsar/persistence-sqlite";

const program = Effect.gen(function* () {
	const persistence = yield* Persistence;
	return yield* persistence.requests.list();
}).pipe(
	withTenant("tenant-1"),
	Effect.provide(makeSqlitePersistenceLayer({ filename: ":memory:" }))
);
```

## Migration Baseline

`0001_initial` creates tenant-scoped tables for:

- requests
- timeline
- policy assignments
- verification evidence
- fulfillment artifacts
- retention policies
- immutable audit events

## Migration Strategy

Migrations are forward-only. For local and test SQLite setups, rollback is
typically handled by replacing the database file.

For PostgreSQL, the SQLite file-replacement guidance does not apply. Use your
environment's normal database rollback or recovery procedure, such as restoring
from backup, using dump/restore workflows, or following the migration toolchain
used by your deployment process before applying schema changes.

## Driver Exports

Driver exports such as `makeSqlitePersistenceLayer` and
`makePgPersistenceLayer` live in dedicated driver packages rather than
`@dsar/persistence` itself.

## Support

- Join our [Discord community](https://c15t.link/discord)
- Open an issue on our [GitHub repository](https://github.com/inthhq/dsar/issues)
- Visit [inth.com](https://inth.com) and use the chat widget
- Contact our support team via email [support@inth.com](mailto:support@inth.com)

## Contributing

- We're open to all community contributions!
- Read our [Contribution Guidelines](https://dsar-sdk.dev/docs/oss/contributing)
- Review our [Code of Conduct](https://dsar-sdk.dev/docs/oss/code-of-conduct)
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

**Built with 💛 by the [inth.com](https://www.inth.com?utm_source=github&utm_medium=repopage_%40dsar%2Fpersistence) team**
