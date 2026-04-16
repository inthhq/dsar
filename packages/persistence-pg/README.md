# @dsar/persistence-pg

Postgres driver package for `@dsar/persistence`.

## Usage

```ts
import { Effect } from "effect";
import { Persistence, withTenant } from "@dsar/persistence";
import { makePgPersistenceLayer } from "@dsar/persistence-pg";

const program = Persistence.pipe(
	Effect.flatMap((persistence) => persistence.requests.list()),
	withTenant("tenant-1"),
	Effect.provide(
		makePgPersistenceLayer({
			config: { url: "postgres://postgres:postgres@localhost:5432/dsar" },
		})
	)
);
```
