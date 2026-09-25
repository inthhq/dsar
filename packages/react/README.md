# `@dsar/react`

React provider and portal widgets for DSAR. Same split as `@c15t/react`:

- **Hosted**: `hosted({ url: "https://org-project.inth.app" })` (adds `/dsar` if the path is empty)
- **Self-host**: `selfHosted({ url })` talks to your DSAR HTTP server (kitchen-sink locally)

Do not pass `DSAR_API_TOKEN` into these components.

```tsx
import { DsarProvider, SubjectPortal, hosted } from "@dsar/react";

export function App() {
	return (
		<DsarProvider mode={hosted({ url: "https://acme-prod.inth.app" })}>
			<SubjectPortal subjectId="sub_123" defaultEmail="ada@example.com" />
		</DsarProvider>
	);
}
```

Local:

```tsx
import { DsarProvider, SubjectPortal, selfHosted } from "@dsar/react";

<DsarProvider
	mode={selfHosted({ url: "http://kitchen-sink.localhost:1355/api/v1" })}
>
	<SubjectPortal />
</DsarProvider>
```

Styles: `import "@dsar/react/styles.css"`.

See `examples/kitchen-sink`, `examples/subject-portal`, and `examples/dashboard`.
