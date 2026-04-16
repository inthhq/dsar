# @dsar/persistence-sqlite

SQLite driver package for `@dsar/persistence`.

## Usage

```ts
import { Effect } from "effect";
import { Persistence, withTenant } from "@dsar/persistence";
import { makeSqlitePersistenceLayer } from "@dsar/persistence-sqlite";

const program = Persistence.pipe(
	Effect.flatMap((persistence) => persistence.requests.list()),
	withTenant("tenant-1"),
	Effect.provide(makeSqlitePersistenceLayer({ filename: ":memory:" }))
);
```
