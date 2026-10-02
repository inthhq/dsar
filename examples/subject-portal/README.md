# Subject portal example

Next.js UI that embeds `<SubjectPortal />`. It talks to the kitchen-sink
self-hosted backend.

```sh
bunx turbo run dev --filter=dsar-kitchen-sink-example --filter=dsar-subject-portal-example
```

- Backend: `http://kitchen-sink.localhost:1355/api/v1`
- Portal: `http://localhost:1356`

File a request with your name and email, then open the operator queue to work it.
Override the backend with `NEXT_PUBLIC_DSAR_URL`.
