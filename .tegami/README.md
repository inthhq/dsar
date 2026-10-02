# Releases

Tegami versions and publishes `dsar` through `.github/workflows/release.yml`.
`dsar` is the only published package. The `@dsar/*` workspaces are private
source folders that tsdown bundles into it, so Tegami ignores them.

## Add release notes

Add `.tegami/YYYY-MM-DD-description.md` with a `dsar` bump and a Markdown
heading:

```md
---
packages:
  dsar: patch
---

### Fix consent persistence

Keep saved preferences after reloading the page.
```

Or run `RELEASE_BRANCH=main bun run tegami` on a feature branch and answer the
prompts.

Choose `patch`, `minor`, or `major` for the change to `dsar`'s public API or
behavior. Internal tooling, tests, and docs-site changes do not need notes.
`packages/dsar/CHANGELOG.md` and `.tegami/publish-lock.yaml` are generated; do
not edit them.

## Release channels

| Branch | npm tag | Workflow |
| --- | --- | --- |
| `main` | `latest` | Version PR, then stable publication |
| `canary` | `canary` | Publish a snapshot for each commit |

On `main`, CI runs `bun run tegami ci`. Pending notes produce a version PR on
`tegami/version-packages-main` with the new version, the changelog, the Bun
lockfile, and the publish lock. Merging it publishes. The wrapper in
`scripts/tegami.ts` publishes an unfinished lock before drafting new notes, so
a failed release retries from the same commit. Tegami's own `ci` command skips
that check, so always go through `bun run tegami ci`.

Canary versions include the full commit SHA, for example
`1.0.1-canary-<sha>.0`. Every push to `canary` publishes one, with or without
notes, and retrying a commit computes the same version. Canary versions and
locks are never committed.

## Publishing checks

Before uploading, the release hook runs these root scripts in order:

1. `build` builds every workspace, including the bundled `dsar` package.
2. `release:docs` regenerates `packages/dsar/docs`, `AGENTS.md`, and
   `SKILL.md` with Leadtype.
3. `check:publish-artifacts` packs `dsar`, installs the tarball into an empty
   npm project, and imports every export. It fails on a leftover `workspace:`
   or `catalog:` specifier, a dependency on a private `@dsar/*` package, a
   missing export target, or an import that needs a package `dsar` does not
   declare.

A failure stops the release with the publish lock intact. Bun packs the
tarball and resolves `workspace:` and `catalog:` ranges; Tegami runs
`npm publish` so npm trusted publishing (OIDC) authenticates the upload.

The publish lock records the release branch and exact version. Publishing
rejects a lock from another branch or with a mismatched version or npm tag.
Keep publishing in `release.yml` on a GitHub-hosted runner with
`id-token: write`; npm trusted publishing is bound to that workflow file.
Configure a trusted publisher on npm for `inthhq/dsar`, workflow
`release.yml`. Until then, the `NPM_RELEASE_TOKEN` secret authenticates the
upload.

## Inspect a release

Use a disposable checkout:

```sh
RELEASE_BRANCH=main bun run tegami version
RELEASE_BRANCH=main bun run tegami publish --dry-run
```

Versioning edits files. The dry run validates the plan and queries the
registry without building or uploading.

Run `bun run test:scripts` after changing `scripts/tegami.ts`.
