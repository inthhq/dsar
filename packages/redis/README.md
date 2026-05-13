# `@dsar/redis`

Optional Redis integrations for DSAR runtimes.

This package currently exports a Redis-backed rate limit store. Install it with
`ioredis` in Node/server deployments that run more than one DSAR runtime
instance.

```ts
import { dsarInstance } from "@dsar/backend";
import { makeRedisRateLimitStore } from "@dsar/redis";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

const runtime = dsarInstance({
	config: {
		rateLimit: {
			store: makeRedisRateLimitStore({ client: redis }),
		},
	},
});
```
