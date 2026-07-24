# DSAR repository guide

This file is the source of truth for coding agents working in this repository.
Keep it focused on repository-specific decisions, commands, and invariants.

## Repository contract

- This is a Bun-managed, ESM-only TypeScript monorepo orchestrated by
  Turborepo.
- Use Node.js 24 (`.node-version`) and the Bun version declared in
  `package.json`.
- Application code compiles with TypeScript 7. The
  `@typescript/typescript6` alias exists only for tools that still require the
  JavaScript compiler API; do not use it to compile product code.
- Runtime code uses Effect 4. Keep `effect`, `@effect/platform-*`,
  `@effect/sql-*`, and `@effect/vitest` on one matching release line.
- Public behavior is defined jointly by package exports, schemas, HTTP routes,
  the Node SDK, the CLI, generated OpenAPI, and docs. A change is incomplete if
  these surfaces disagree.
- Preserve unrelated worktree changes. Do not reset, rewrite, or delete work
  you did not create.

## Start here

```sh
node --version
bun --version
bun install --frozen-lockfile
bun run typecheck
```

The dependency age gate lives in `bunfig.toml` and rejects packages published
less than 24 hours ago.

Read the relevant project skill before changing its area:

- `.agents/skills/effect-ts/SKILL.md` for Effect code
- `.agents/skills/turborepo/SKILL.md` for task graph or cache changes
- `.agents/skills/tsdown/SKILL.md` for package build changes
- `.agents/skills/ultracite/SKILL.md` for lint or format configuration
- `.agents/skills/find-skills/SKILL.md` when a missing capability may already
  exist as an installable skill

Claude-compatible links in `.claude/skills` point at these same files. Update
project skills with `bunx skills update --project --yes`; commit the skill files,
links, and `skills-lock.json` together. After an update, verify that the Effect
skill still targets `Effect-TS/effect` on `main` and uses `.repos/effect`; the
upstream skill has previously referenced an obsolete repository and checkout
path.

For Effect work, prepare the ignored reference checkout:

```sh
bun run prepare:effect
```

This clones or updates `Effect-TS/effect` on `main` into `.repos/effect`. Use
that checkout as the API and migration source of truth when installed package
types are not enough. At the July 2026 refresh, Effect 4 is still published as
`4.0.0-beta.101`, not a GA `4.0.0`; verify npm metadata and upstream `main`
before changing that statement or the catalog.

## Workspace map

- `packages/dsar`: public umbrella package and subpath exports; built with
  tsdown.
- `packages/backend`: Effect HTTP API, lifecycle orchestration, auth,
  middleware, OpenAPI, and runtime assembly.
- `packages/core`: application-facing client modes and the Chat SDK state
  adapter.
- `packages/node-sdk`: typed HTTP client and framework-neutral webhook receiver.
- `packages/cli`: command definitions, interactive flows, and API parity tests.
- `packages/internals/schema`: canonical domain schemas and shared runtime
  contracts.
- `packages/internals/persistence`: tenant-scoped repository contracts, SQL
  implementation, and ordered migrations.
- `packages/internals/policy-engine`: deterministic policy evaluation and
  explainability.
- `packages/internals/policy-packs`: registry, pinning, diff, audit, and upgrade
  workflows.
- `packages/internals/error-codes`: shared error catalog.
- `packages/internals/guards`: shared runtime parsers and guards.
- `packages/persistence-pg` and `packages/persistence-sqlite`: database-specific
  layers and migration conformance.
- `packages/auth-unkey`, `packages/inbound-*`, `packages/outbound-*`,
  `packages/redis`, `packages/upstash`, and `packages/storage-*`: optional
  adapters.
- `examples/kitchen-sink`: runnable integration example and smoke client.
- `docs`: Leadtype-authored MDX documentation and navigation metadata.

## Non-negotiable invariants

### Tenant and authorization safety

- Every persistence operation that reads or writes tenant data must require
  `TenantContext` and run through `withTenant`.
- Tenant identifiers come from verified runtime context, not request payloads
  or untrusted adapter metadata.
- Never loosen the split between machine bearer-token access and trusted-host
  identity projection without updating auth tests and the auth model docs.
- New routes must declare their auth lane and authorization requirements
  explicitly.

### Domain and lifecycle correctness

- Decode `unknown` at system boundaries with Effect Schema or a focused guard.
  Do not cast request bodies, persisted JSON, or adapter payloads into domain
  types.
- Keep policy evaluation deterministic. New inputs must be represented in the
  explainability trace and covered by golden or matrix tests.
- Lifecycle mutations must preserve auditability, typed failures, and legal
  clock behavior.
- Adapter failures must not silently corrupt request state or bypass lifecycle
  rules.

### Public contracts

- Public exports are explicit package entrypoints. Avoid new convenience barrel
  files, but preserve intentional package entrypoints and the `dsar` umbrella
  exports.
- Public failures use the established typed error classes, catalog codes, and
  response envelopes. Add or update the matching file under
  `docs/reference/errors` when the catalog changes.
- Keep runtime behavior, schemas, SDK types, CLI commands, OpenAPI, and docs in
  sync.

## Effect conventions

- Import focused Effect modules, for example
  `import * as Effect from "effect/Effect"` and
  `import * as Schema from "effect/Schema"`. The root `effect` import is
  lint-restricted except for type-only imports.
- Define services with `Context.Service` and provide implementations through
  Layers. Keep requirements visible in the effect environment.
- Prefer `Effect.gen`, `Effect.fn`, and typed combinators over nested promises.
  Use `Effect.runPromise` only at an actual runtime, adapter, or test boundary.
- Model expected failures in the error channel with descriptive tagged error
  types. Do not use defects for routine validation or integration failures.
- Use Schema transformations and decoding defaults according to current Effect
  4 signatures. Confirm unfamiliar APIs in `.repos/effect`.
- Use `@effect/vitest` for effectful tests and provide Layers explicitly.
- When upgrading Effect, update the entire Effect catalog together, then search
  for removed module names and regenerate the OpenAPI snapshot after reviewing
  the semantic diff.

## Change-impact checklist

| If you change... | Also inspect... |
| --- | --- |
| HTTP route or payload | backend schema/handler tests, `@dsar/node-sdk`, CLI parity, OpenAPI snapshot, API docs |
| Domain schema | persistence mappings, policy engine, backend codecs, SDK types, fixtures |
| Persistence contract | SQL implementation, both driver layers, migrations, migration conformance, test fakes |
| Migration registry | a new monotonic migration file, up/down coverage, clean install, previous-version upgrade, concurrency metadata tests |
| Adapter contract | adapter registry, conformance tests, package peer dependencies, integration docs |
| Error catalog | exported IDs, response mapping, contract tests, matching error MDX |
| Public export | source entrypoint, `packages/dsar` subpath export, tsdown output, publint/ATTW |
| CLI command | command schema, runtime handler, help/interactive flow, SDK parity and E2E matrix |
| Docs navigation | `docs/docs.config.ts`, the relevant `meta.json`, internal links, Leadtype lint |

Treat `packages/backend/test/__snapshots__/openapi.test.ts.snap` as a reviewed
contract, not a file to update blindly. Effect upgrades can legitimately alter
JSON Schema shape and automatic responses; inspect those changes before
accepting the snapshot.

## Dependencies and tooling

- Use Bun only. `bun.lock` is canonical; do not create npm, pnpm, or Yarn lock
  files.
- Prefer root catalogs for versions shared across workspaces. Keep peer ranges
  compatible with the exact development dependency used in that adapter.
- Check candidates with `bun outdated --recursive`. An asterisk means Bun held
  a newer release back because of `minimumReleaseAge`.
- Keep `@types/node` on the Node 24 line even when a newer Node major exists.
- Latest Leadtype currently needs the committed
  `patches/leadtype@0.4.2.patch` so its snippet parser uses the TypeScript 6 API
  alias. Re-evaluate and remove the patch when upstream supports the TypeScript
  7 API surface.
- Ultracite 7 is configured through `oxlint.config.ts` and
  `oxfmt.config.ts`. Package-local legacy `.oxlintrc.json` files should not be
  reintroduced.
- GitHub Actions are pinned to full commit SHAs with a version comment. Do not
  edit `.github/workflows/pullfrog.yml`; it is externally managed.

## Testing and validation

Use the smallest relevant loop while developing:

```sh
bun run --cwd packages/backend test
bun run --cwd packages/internals/persistence test
bunx turbo run typecheck --filter=@dsar/backend
bun x ultracite check
```

Before handing off a code, dependency, schema, or tooling change, run:

```sh
bun install --frozen-lockfile
bun run check
bun run typecheck
bun run test
bun run build
```

`bun run check` covers Ultracite, docs warnings, Leadtype links/snippets, error
docs, and exported TSDoc. It does not replace typechecks or tests.

Postgres integration tests skip without their test database configuration. The
kitchen-sink smoke test also requires a running DSAR server plus one of
`DSAR_ADMIN_API_TOKEN`, `DSAR_API_TOKEN`, or `DSAR_TEST_API_TOKEN`; a missing
token is an environment prerequisite failure, not a passing smoke result.

When a snapshot changes, run the focused test first, inspect the diff, then run
the full suite. Never commit `.only`, `.skip`, debug logging, or an unexplained
snapshot rewrite.

## Generated and release-sensitive files

- `packages/backend/test/__snapshots__/openapi.test.ts.snap` is generated by the
  backend OpenAPI test but reviewed as a public contract.
- `packages/storage-s3/src/generated/s3.ts` is checked-in generated integration
  code; keep edits mechanical and test the storage adapter.
- Build output, coverage, `.turbo`, `.repos/effect`, and release-generated
  `packages/dsar/docs`, `packages/dsar/AGENTS.md`, and
  `packages/dsar/SKILL.md` are not source changes.
- Add a Changeset for user-visible package behavior, public API, runtime
  requirement, or dependency compatibility changes. Keep unrelated package
  changes out of the same Changeset.

## Git hygiene

- Keep commits focused by task and use product-relevant messages.
- Never add AI, model, Codex, or Claude provenance labels to branch names,
  commits, PR titles, or PR bodies.
- Do not amend, force-push, publish, or open a PR unless the user explicitly
  asks.
- Before committing, inspect `git diff --check`, the staged file list, and any
  generated or lockfile changes.
