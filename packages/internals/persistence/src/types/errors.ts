import * as Data from "effect/Data";

import type { PersistenceErrorCode, PersistenceErrorId } from "./error-codes";

/**
 * Failure raised when tenant scope is missing for a repository operation.
 */
export class MissingTenantScopeError extends Data.TaggedError(
	"MissingTenantScopeError"
)<{
	readonly code?: PersistenceErrorCode;
	readonly docsUrl?: string;
	readonly errorId?: PersistenceErrorId;
	readonly operation: string;
}> {}

/**
 * Failure raised when a persistence operation is intentionally unsupported.
 */
export class UnsupportedPersistenceOperationError extends Data.TaggedError(
	"UnsupportedPersistenceOperationError"
)<{
	readonly code?: PersistenceErrorCode;
	readonly docsUrl?: string;
	readonly errorId?: PersistenceErrorId;
	readonly operation: string;
	readonly reason: string;
}> {}

/**
 * Failure raised when a scoped entity is not found.
 */
export class PersistenceEntityNotFoundError extends Data.TaggedError(
	"PersistenceEntityNotFoundError"
)<{
	readonly code?: PersistenceErrorCode;
	readonly docsUrl?: string;
	readonly errorId?: PersistenceErrorId;
	readonly entity: string;
	readonly id: string;
}> {}

/**
 * Failure raised when persisted row values violate expected domain contracts.
 */
export class PersistenceInvalidRecordError extends Data.TaggedError(
	"PersistenceInvalidRecordError"
)<{
	readonly code?: PersistenceErrorCode;
	readonly docsUrl?: string;
	readonly errorId?: PersistenceErrorId;
	readonly entity: string;
	readonly field: string;
	readonly value: string;
}> {}

/**
 * Union of persistence-layer expected failures.
 */
export type PersistenceError =
	| MissingTenantScopeError
	| UnsupportedPersistenceOperationError
	| PersistenceEntityNotFoundError
	| PersistenceInvalidRecordError;
