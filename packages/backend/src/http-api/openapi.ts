import * as OpenApi from "effect/unstable/httpapi/OpenApi";

import { makeDsarHttpApi } from "./api";

/**
 * Generates an OpenAPI specification from the canonical HttpApi contracts.
 *
 * @param basePath - Base path prefix prepended to every API route
 *   (e.g. `"/api/dsar"`). Must start with `"/"`.
 * @returns An {@link OpenApi.OpenAPISpec} object suitable for serving to
 *   Scalar, Swagger UI, or OpenAPI validators.
 */
export const createOpenApiSpec = (basePath: string): OpenApi.OpenAPISpec =>
	OpenApi.fromApi(makeDsarHttpApi(basePath));

/**
 * Renders a minimal interactive API docs page powered by Scalar.
 *
 * @param specUrl - Public URL where the OpenAPI JSON spec is served
 *   (e.g. `"/openapi.json"`).
 * @returns A self-contained HTML string that loads the Scalar API
 *   reference widget pointing at `specUrl`.
 */
export const renderDocsHtml = (specUrl: string): string => `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>DSAR API Docs</title>
	</head>
	<body>
		<script
			id="api-reference"
			data-url="${specUrl}"
		></script>
		<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
	</body>
</html>`;
