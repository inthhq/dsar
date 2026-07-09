import * as Schema from "effect/Schema";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";

import { protectedOperation, publicOperation, s200 } from "../common";
import { successEnvelope } from "../schemas";

/** OpenAPI group describing runtime health and status endpoints. */
export const statusGroup = HttpApiGroup.make("status", { topLevel: true })
	.add(
		publicOperation(
			HttpApiEndpoint.get("status_health", "/status", {
				success: successEnvelope(
					Schema.Struct({
						service: Schema.String,
						status: Schema.String,
					})
				).pipe(s200),
			}),
			"Runtime health status"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get("status_diagnostics", "/status/diagnostics", {
				success: successEnvelope(
					Schema.Struct({
						adapters: Schema.Array(
							Schema.Struct({
								capability: Schema.String,
								details: Schema.optional(
									Schema.Record(Schema.String, Schema.Unknown)
								),
								key: Schema.String,
								status: Schema.String,
							})
						),
						migrations: Schema.Struct({
							applied: Schema.Array(
								Schema.Struct({
									id: Schema.Number,
									name: Schema.String,
								})
							),
							current: Schema.Boolean,
							expected: Schema.Array(
								Schema.Struct({
									id: Schema.Number,
									name: Schema.String,
								})
							),
						}),
						persistence: Schema.Struct({
							error: Schema.optional(Schema.String),
							reachable: Schema.Boolean,
						}),
					})
				).pipe(s200),
			}),
			"Runtime diagnostics"
		)
	);
