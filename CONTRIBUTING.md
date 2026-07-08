# Contributing to DSAR

Thanks for helping improve DSAR. This project is a Bun-based TypeScript
monorepo for a developer-first Data Subject Access Request engine.

## Community

- Use GitHub issues for bug reports, feature requests, and focused technical
  discussions: https://github.com/inthhq/dsar/issues
- Join the community Discord for questions and informal discussion:
  https://inth.com/discord
- Do not report security vulnerabilities or sensitive conduct issues in public
  GitHub issues or Discord channels.

## Before You Start

1. Search existing issues and pull requests to avoid duplicate work.
2. Open an issue for substantial changes before investing in implementation.
3. Keep pull requests focused on one problem or feature.

## Local Development

Install dependencies:

```sh
bun install
```

Run the main validation suite:

```sh
bun run check
```

Run tests:

```sh
bun run test
```

Format and fix common issues:

```sh
bun x ultracite fix
```

For package-specific work, prefer the scripts already defined in the relevant
package and the root workspace scripts in `package.json`.

## Pull Requests

- Create a descriptive branch name for the change.
- Include a clear summary of what changed and why.
- Link related issues in the pull request description.
- Add or update tests when behavior changes.
- Update documentation when public APIs, commands, or user workflows change.
- Run the relevant checks before requesting review.

If a change affects a published package, include a changeset:

```sh
bun run changeset
```

Choose the smallest accurate release type and describe the user-visible change.

## Code Standards

DSAR uses Ultracite for formatting and linting. Follow the standards in
`AGENTS.md` and prefer code that is accessible, type-safe, explicit, and easy to
review. Keep changes scoped to the request and avoid unrelated refactors.

## Security Reports

If you believe you have found a security vulnerability, do not open a public
issue or discuss it in Discord. Use GitHub private vulnerability reporting at
https://github.com/inthhq/dsar/security or email support@inth.com.
