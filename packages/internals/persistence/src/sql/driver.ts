import type { Config, Layer } from "effect";
import type * as SqlClient from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";

/**
 * Supported persistence driver kinds.
 */
export type PersistenceDriverKind = "sqlite" | "pg";

/**
 * Driver abstraction used to keep repository contracts stable across engines.
 */
export interface PersistenceDriver {
	/** Driver kind used for runtime diagnostics/composition. */
	readonly kind: PersistenceDriverKind;
	/** Layer that provides the SQL client used by repositories. */
	readonly layer: Layer.Layer<
		SqlClient.SqlClient,
		Config.ConfigError | SqlError
	>;
}
