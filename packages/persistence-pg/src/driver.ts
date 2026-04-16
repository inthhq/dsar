import type { PersistenceDriver } from "@dsar/persistence";
import * as PgClient from "@effect/sql-pg/PgClient";

/**
 * Creates a PostgreSQL persistence driver from the given client configuration.
 *
 * @param config - PostgreSQL client options (connection URL, pool size, SSL,
 *   etc.) forwarded to `@effect/sql-pg`.
 * @returns A {@link PersistenceDriver} backed by a PostgreSQL connection layer.
 */
export const pgDriver = (
	config: PgClient.PgClientConfig
): PersistenceDriver => ({
	kind: "pg",
	layer: PgClient.layer(config),
});
