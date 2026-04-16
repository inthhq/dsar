import * as Schema from "effect/Schema";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";

import { publicOperation } from "../common";
import { successEnvelope } from "../schemas";

/** OpenAPI group describing runtime initialization endpoints. */
export const initGroup = HttpApiGroup.make("init", { topLevel: true }).add(
	publicOperation(
		HttpApiEndpoint.post("init_runtime", "/init", {
			success: successEnvelope(
				Schema.Struct({
					initialized: Schema.Boolean,
				})
			),
		}),
		"Initialize DSAR runtime context"
	)
);
