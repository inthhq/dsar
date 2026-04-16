# `@dsar/auth-unkey`

Optional Unkey bearer-token resolver for DSAR runtimes.

You can import it directly from `@dsar/auth-unkey` or from the umbrella package
via `dsar/auth-unkey`.

## Usage

```ts
import { makeUnkeyBearerResolver } from "@dsar/auth-unkey";

const resolveBearerToken = makeUnkeyBearerResolver({
	rootKey: process.env.UNKEY_ROOT_KEY!,
	permissions: "dsar.api",
	fallbackPrincipalKind: "service",
	fallbackRole: "admin",
});
```

Use this package for DSAR's machine-access lane:

- hosted API keys
- CLI and SDK access
- service-to-service traffic

Keep browser-facing flows on host-authenticated sessions and
`resolveTrustedRequestIdentity` instead of distributing long-lived DSAR keys.
