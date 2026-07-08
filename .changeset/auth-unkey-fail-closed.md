---
"dsar": patch
---

Fail closed in the Unkey bearer resolver when key verification throws, treating provider errors and unreachable Unkey hosts as unauthenticated instead of surfacing provider exceptions.
