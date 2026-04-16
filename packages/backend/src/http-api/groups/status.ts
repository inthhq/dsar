import * as Schema from "effect/Schema";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";

import { publicOperation, s200 } from "../common";
import { successEnvelope } from "../schemas";

/** OpenAPI group describing runtime health and status endpoints. */
export const statusGroup = HttpApiGroup.make("status", { topLevel: true }).add(
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
);
