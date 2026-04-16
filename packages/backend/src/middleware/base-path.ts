import { RequestValidationError } from "../types/errors";

/**
 * Normalizes an optional base-path string into a canonical form
 * suitable for route prefix matching.
 *
 * @param [value] - Raw base-path value (e.g. `"/api/dsar/"`). When
 *   `undefined` or `"/"`, returns an empty string (no prefix).
 * @returns The trimmed path without a trailing slash, or `""` when no
 *   prefix is needed.
 * @throws {RequestValidationError} When `value` does not start with `"/"`.
 */
export const normalizeBasePath = (value?: string): string => {
	if (!value || value === "/") {
		return "";
	}

	const trimmed = value.trim();
	if (!trimmed.startsWith("/")) {
		throw new RequestValidationError({
			message: "basePath must start with '/'.",
			reasonCode: "REQUEST_BASE_PATH_INVALID",
		});
	}

	const withoutTrailing =
		trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
	return withoutTrailing === "/" ? "" : withoutTrailing;
};

/**
 * Strips a previously normalised base path from a request pathname.
 *
 * @param pathname - Full request pathname (e.g. `"/api/dsar/requests"`).
 * @param basePath - Normalised base path returned by
 *   {@link normalizeBasePath} (e.g. `"/api/dsar"`).
 * @returns The pathname with the prefix removed (e.g. `"/requests"`),
 *   `"/"` when `pathname` equals `basePath` exactly, or `undefined`
 *   when `pathname` does not begin with `basePath`.
 */
export const stripBasePath = (
	pathname: string,
	basePath: string
): string | undefined => {
	if (!basePath) {
		return pathname || "/";
	}
	if (pathname === basePath) {
		return "/";
	}
	if (pathname.startsWith(`${basePath}/`)) {
		return pathname.slice(basePath.length);
	}
	return undefined;
};
