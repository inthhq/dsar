export type DemoDatabaseOperation =
	| "close"
	| "decode"
	| "delete"
	| "initialize"
	| "read"
	| "seed";

/** Typed failure raised when the demo SQLite store cannot complete an operation. */
export class DemoDatabaseError extends Error {
	readonly operation: DemoDatabaseOperation;

	constructor(operation: DemoDatabaseOperation, cause: unknown) {
		const detail = cause instanceof Error ? `: ${cause.message}` : "";
		super(`Demo SQLite ${operation} failed${detail}`, { cause });
		this.name = "DemoDatabaseError";
		this.operation = operation;
	}
}
