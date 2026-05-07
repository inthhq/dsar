# `@dsar/upstash`

Optional Upstash integrations for DSAR runtimes.

This package currently exports an Upstash Redis-backed rate limit store. Install
it with `@upstash/redis` for edge-friendly or serverless deployments that run
more than one DSAR runtime instance.

```ts
import { dsarInstance } from "@dsar/backend";
import { makeUpstashRateLimitStore } from "@dsar/upstash";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const runtime = dsarInstance({
	config: {
		rateLimit: {
			store: makeUpstashRateLimitStore({ client: redis }),
		},
	},
});
```
