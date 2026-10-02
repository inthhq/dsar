---
"dsar": minor
---

Add a tenant-scoped `onDeadWebhook` alert when outbound webhook jobs exhaust retries, and operator DLQ commands `dsar webhooks dlq list` and `dsar webhooks dlq replay` over dead `notification_delivery_attempts` rows. Bulk replay now accepts `status=dead`.
