import * as Schema from "effect/Schema";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";

import { protectedOperation, s200 } from "../common";
import { successEnvelope } from "../schemas";

/** OpenAPI group describing subject-profile lookup endpoints. */
export const subjectsGroup = HttpApiGroup.make("subjects", {
	topLevel: true,
}).add(
	protectedOperation(
		HttpApiEndpoint.get("subjects_get_profile", "/subjects/:subjectId", {
			params: { subjectId: Schema.String },
			query: {
				created_after: Schema.optional(Schema.String),
				created_before: Schema.optional(Schema.String),
				cursor: Schema.optional(Schema.String),
				limit: Schema.optional(Schema.NumberFromString),
				policy_pack: Schema.optional(Schema.String),
				status: Schema.optional(Schema.String),
			},
			success: successEnvelope(
				Schema.Struct({
					pagination: Schema.Struct({
						limit: Schema.Number,
						nextCursor: Schema.optional(Schema.String),
					}),
					requests: Schema.Array(
						Schema.Struct({
							id: Schema.String,
							receivedAt: Schema.optional(Schema.String),
							status: Schema.String,
						})
					),
					subjectId: Schema.String,
				})
			).pipe(s200),
		}),
		"Get subject profile"
	)
);
