# Operator dashboard example

Next.js UI that embeds `<OperatorQueue />` against kitchen-sink.

```sh
bunx turbo run dev --filter=dsar-kitchen-sink-example --filter=dsar-dashboard-example
```

- Backend: `http://kitchen-sink.localhost:1355/api/v1`
- Dashboard: `http://localhost:1357`

Verify, fulfil, or refuse filings from the subject portal.
Override with `NEXT_PUBLIC_DSAR_URL`.
