import type { PersistenceError } from "@dsar/persistence";
import type {
	PolicyActivationNotFoundError,
	PolicyPacksError,
	UnauthorizedApproverError,
	UnmappedJurisdictionError,
} from "@dsar/policy-packs";
import * as Data from "effect/Data";
import type { SqlError } from "effect/unstable/sql/SqlError";

import type { BackendErrorCode } from "./error-codes";

/**
 * Subset of {@link BackendErrorCode} scoped to lifecycle state-machine
 * transitions (codes prefixed with `LIFECYCLE_`).
 */
export type BackendLifecycleErrorCode = Extract<
	BackendErrorCode,
	`LIFECYCLE_${string}`
>;

/**
 * Raised when a request payload fails schema or business-rule validation;
 * caught by the top-level error handler and mapped to a 400 response.
 */
export class RequestValidationError extends Data.TaggedError(
	"RequestValidationError"
)<{
	readonly message: string;
	readonly reasonCode?: BackendErrorCode;
	readonly details?: Readonly<Record<string, unknown>>;
}> {}

/**
 * Raised when authentication or authorization checks fail; mapped to a
 * 401/403 response by the error handler.
 */
export class UnauthorizedRequestError extends Data.TaggedError(
	"UnauthorizedRequestError"
)<{
	readonly message: string;
}> {}

/**
 * Raised when an authenticated caller is not permitted to access the requested
 * route or resource; mapped to a 403 response by the error handler.
 */
export class ForbiddenRequestError extends Data.TaggedError(
	"ForbiddenRequestError"
)<{
	readonly message: string;
	readonly reasonCode?: BackendErrorCode;
	readonly details?: Readonly<Record<string, unknown>>;
}> {}

/**
 * Raised when no route definition matches the incoming method and path;
 * mapped to a 404 response by the error handler.
 */
export class RouteNotFoundError extends Data.TaggedError("RouteNotFoundError")<{
	readonly method: string;
	readonly path: string;
}> {}

/**
 * Catch-all failure for unexpected runtime conditions (unhandled exceptions,
 * missing services); mapped to a 500 response.
 */
export class InternalRuntimeError extends Data.TaggedError(
	"InternalRuntimeError"
)<{
	readonly message: string;
}> {}

/**
 * Raised when a lifecycle action is attempted from an incompatible status
 * (e.g. fulfilling an already-closed request); mapped to a 409 response.
 */
export class InvalidLifecycleTransitionError extends Data.TaggedError(
	"InvalidLifecycleTransitionError"
)<{
	readonly requestId: string;
	readonly from: string;
	readonly action: string;
	readonly reasonCode: BackendLifecycleErrorCode;
}> {}

/**
 * Raised when a lifecycle action that requires an operator rationale
 * (e.g. refusal, extension) is submitted without one.
 */
export class MissingLifecycleRationaleError extends Data.TaggedError(
	"MissingLifecycleRationaleError"
)<{
	readonly requestId: string;
	readonly action: string;
	readonly reasonCode: BackendErrorCode;
}> {}

/**
 * Raised when pre-fulfilment guards detect incomplete prerequisites
 * (e.g. missing artifact manifest or pending verification).
 */
export class FulfilmentGuardError extends Data.TaggedError(
	"FulfilmentGuardError"
)<{
	readonly requestId: string;
	readonly reasonCode: BackendErrorCode;
}> {}

/**
 * Discriminated union of every error type the backend Effect handlers may
 * produce, used by the top-level error handler to derive HTTP responses.
 */
export type BackendRuntimeError =
	| RequestValidationError
	| UnauthorizedRequestError
	| ForbiddenRequestError
	| RouteNotFoundError
	| InternalRuntimeError
	| InvalidLifecycleTransitionError
	| MissingLifecycleRationaleError
	| FulfilmentGuardError
	| PolicyPacksError
	| UnauthorizedApproverError
	| UnmappedJurisdictionError
	| PolicyActivationNotFoundError
	| PersistenceError
	| SqlError;
