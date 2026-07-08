---
"dsar": minor
---

Fail closed in the Unkey bearer resolver when key verification throws, treating provider errors and unreachable Unkey hosts as unauthenticated instead of surfacing provider exceptions, and add an optional `onVerifyError` hook so hosts can log or emit metrics for thrown verification failures.
