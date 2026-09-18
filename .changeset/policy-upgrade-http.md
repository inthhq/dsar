---
"dsar": patch
---

Declare the policy-upgrade propose body (`fromVersion`, `tenantId`, `toVersion`) in OpenAPI, and keep propose/approve/apply state for the life of a backend runtime instance so HTTP upgrades can complete.
