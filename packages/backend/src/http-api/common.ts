import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema";
import * as OpenApi from "effect/unstable/httpapi/OpenApi";

interface AnnotatableEndpoint<Self> {
	readonly annotateMerge: (
		annotations: ReturnType<typeof OpenApi.annotations>
	) => Self;
}

/**
 * Marks an endpoint as publicly accessible in generated OpenAPI metadata.
 *
 * @param operation - Endpoint operation to annotate.
 * @param summary - Human-readable operation summary.
 * @typeParam A - Concrete endpoint type being annotated.
 * @returns The annotated endpoint operation.
 */
export const publicOperation = <A extends AnnotatableEndpoint<A>>(
	operation: A,
	summary: string
): A =>
	operation.annotateMerge(OpenApi.annotations({ summary })).annotateMerge(
		OpenApi.annotations({
			override: { security: [] },
		})
	) as A;

/**
 * Marks an endpoint as bearer-auth protected in generated OpenAPI metadata.
 *
 * @param operation - Endpoint operation to annotate.
 * @param summary - Human-readable operation summary.
 * @typeParam A - Concrete endpoint type being annotated.
 * @returns The annotated endpoint operation.
 */
export const protectedOperation = <A extends AnnotatableEndpoint<A>>(
	operation: A,
	summary: string
): A =>
	operation.annotateMerge(OpenApi.annotations({ summary })).annotateMerge(
		OpenApi.annotations({
			override: {
				security: [{ BearerAuth: [] }],
			},
		})
	) as A;

/** OpenAPI success-status annotation for `200 OK` responses. */
export const s200 = HttpApiSchema.status(200);
/** OpenAPI success-status annotation for `202 Accepted` responses. */
export const s202 = HttpApiSchema.status(202);
