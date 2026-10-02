---
packages:
  dsar: major
---

### Install `dsar` from npm without unpublished dependencies

`dsar@0.0.5` depended on `@dsar/*` workspace packages that were never
published, so `npm install dsar` failed. `dsar` now bundles that code and is
the only package you install.

Libraries an adapter needs are optional peer dependencies. Install the ones
for the subpaths you import, for example `@effect/sql-pg` for
`dsar/persistence-pg`, `@aws-sdk/client-s3` for `dsar/storage-s3`, or `react`
for `dsar/react`. `effect` is a required peer.
