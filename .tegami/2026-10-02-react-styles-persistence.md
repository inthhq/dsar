---
packages:
  dsar: minor
---

### Add `dsar/persistence` and `dsar/react/styles.css`

`dsar/persistence` exports the persistence contract the driver layers need,
including `Persistence`, `withTenant`, and `TenantContext`, so Effect
applications can compose `makePgPersistenceLayer` and
`makeSqlitePersistenceLayer` without a private package.

`dsar/react/styles.css` ships the stylesheet for the React widgets, and
`dsar/react` keeps its `"use client"` directive so Next.js server components
can render the widgets.
