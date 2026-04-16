# Adapter Conformance Suite

This directory defines the baseline contract conformance checks required by T15.

## What every adapter implementation must satisfy

- **Lifecycle hooks**
  - `validateConfig(config)` accepts/rejects configuration deterministically
  - `init(config)` performs initialization without leaking provider errors directly
- **Health and diagnostics**
  - `healthCheck()` returns `{ ok, status }` where status is `healthy`, `degraded`, or `down`
  - `diagnostics()` returns adapter key/capability metadata
- **Error normalization**
  - provider errors are normalized to `AdapterInvocationError`
  - retriable classification is explicit (`retriable: true/false`)

## Capability classes

- `notifications`
- `storage`
- `inbound`

## How child tickets should use this suite

- T15A/T15B/T15C/T15D implementations should add fixture-backed tests in this folder and assert:
  - conformance lifecycle behavior
  - capability-specific invocation semantics
  - failure normalization behavior

This suite is intentionally provider-neutral and should remain stable as new adapters are added.
