---
packages:
  dsar: patch
---

### Return 400s for malformed intake bodies

Validate create and capture request bodies with IntakePayloadSchema so malformed JSON and schema failures return catalog 400s instead of 500s. Tenant and actor identity still come from request context.
