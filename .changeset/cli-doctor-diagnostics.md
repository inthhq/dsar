---
"dsar": minor
---

Add a `dsar doctor` diagnostics command with config, runtime reachability, auth, migration freshness, and adapter health checks backed by a new operator-scoped `GET /status/diagnostics` endpoint and `client.diagnostics()` Node SDK method, plus command help snapshots and grouped `--help` output.
