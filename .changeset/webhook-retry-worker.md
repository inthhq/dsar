---
"dsar": minor
---

Outbound webhook delivery writes a pending attempt before send, retries on a durable 1m/5m/30m/2h/6h/24h schedule after the request returns, marks exhausted jobs `dead`, and appends a request timeline event for each attempt.
