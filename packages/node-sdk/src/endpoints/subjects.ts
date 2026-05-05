import type { DsarResult, RequestOptions } from "../types";
import type {
	EndpointContext,
	SubjectProfileQuery,
	SubjectProfileResponse,
} from "./types";

/**
 * Optional request customizations for subject profile lookups.
 */
export interface SubjectProfileRequestOptions extends RequestOptions {
	/** Query filters and cursor pagination controls for subject request lookup. */
	readonly query?: SubjectProfileQuery;
}

/**
 * Read-only client interface for the Subjects API namespace. Provides
 * remote retrieval of data-subject profiles via {@link getProfile}.
 */
export interface SubjectsApi {
	/**
	 * Fetches the profile for a data subject by their identifier.
	 *
	 * @param subjectId - Unique subject identifier (e.g. UUID or external ref).
	 * @param options - Optional per-request overrides such as idempotency key
	 *   and additional headers, plus subject lookup query filters.
	 * @returns A promise resolving to a {@link DsarResult} containing the
	 *   {@link SubjectProfileResponse} with the subject's profile data and
	 *   associated result metadata.
	 */
	readonly getProfile: (
		subjectId: string,
		options?: SubjectProfileRequestOptions
	) => Promise<DsarResult<SubjectProfileResponse>>;
}

/**
 * Creates the {@link SubjectsApi} client bound to the given endpoint context.
 *
 * @param ctx - Shared HTTP transport and configuration for SDK calls.
 * @returns A {@link SubjectsApi} instance whose methods issue HTTP requests
 *   through `ctx.call`.
 */
export const makeSubjectsApi = (ctx: EndpointContext): SubjectsApi => ({
	getProfile: (subjectId, options) =>
		ctx.call({
			method: "GET",
			options,
			path: `/subjects/${subjectId}`,
			query: options?.query,
		}),
});
