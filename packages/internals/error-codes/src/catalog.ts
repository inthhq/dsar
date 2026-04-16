/**
 * Canonical DSAR error identifier format (`DSAR-<namespace>-<number>`).
 */
export type ErrorId = `DSAR-${string}-${number}`;

/**
 * Source catalog entry used to register a DSAR error code.
 *
 * @typeParam TCode - Stable code type for this catalog item.
 * @typeParam TId - Stable DSAR ID type for this catalog item.
 */
export interface ErrorCatalogInputEntry<
	TCode extends string = string,
	TId extends ErrorId = ErrorId,
> {
	/** Stable machine-readable error code token. */
	readonly code: TCode;
	/** URL slug used to construct documentation links. */
	readonly docsSlug: Lowercase<TId>;
	/** Stable DSAR error identifier. */
	readonly id: TId;
	/** Owning package or domain namespace. */
	readonly namespace: string;
	/** Default HTTP status associated with this error. */
	readonly status: number;
	/** Human-readable title for operators and docs. */
	readonly title: string;
}

/**
 * Catalog entry enriched with a fully-qualified documentation URL.
 *
 * @typeParam TCode - Stable code type for this catalog item.
 * @typeParam TId - Stable DSAR ID type for this catalog item.
 */
export interface ErrorCatalogEntry<
	TCode extends string = string,
	TId extends ErrorId = ErrorId,
> extends ErrorCatalogInputEntry<TCode, TId> {
	/** Absolute documentation URL for this error. */
	readonly docsUrl: string;
}

/**
 * Indexed registry used for error-code and error-ID lookups.
 *
 * @typeParam TCode - Stable code union represented in this registry.
 * @typeParam TId - Stable DSAR ID union represented in this registry.
 */
export interface ErrorRegistry<
	TCode extends string = string,
	TId extends ErrorId = ErrorId,
> {
	/** Lookup table keyed by error code. */
	readonly byCode: Readonly<Record<TCode, ErrorCatalogEntry<TCode, TId>>>;
	/** Lookup table keyed by DSAR error ID. */
	readonly byId: Readonly<Record<TId, ErrorCatalogEntry<TCode, TId>>>;
	/** Ordered list of registered error codes. */
	readonly codes: readonly TCode[];
	/** Registered catalog entries with docs URLs attached. */
	readonly entries: readonly ErrorCatalogEntry<TCode, TId>[];
	/** Resolves a code to its catalog entry, falling back to the configured fallback code for unknown codes. */
	readonly resolve: (code: string) => ErrorCatalogEntry<TCode, TId>;
}

type CatalogCodesTuple<
	TEntries extends readonly ErrorCatalogInputEntry<string, ErrorId>[],
> = {
	readonly [K in keyof TEntries]: TEntries[K] extends ErrorCatalogInputEntry<
		infer TCode,
		ErrorId
	>
		? TCode
		: never;
};

/**
 * Default base URL used to build DSAR error documentation links.
 */
export const DSAR_ERROR_DOCS_BASE_URL = "https://dsar-sdk.dev/errors";

const toCatalogEntry = <TCode extends string, TId extends ErrorId>(
	entry: ErrorCatalogInputEntry<TCode, TId>,
	docsBaseUrl: string
): ErrorCatalogEntry<TCode, TId> => ({
	...entry,
	docsUrl: `${docsBaseUrl}/${entry.docsSlug}`,
});

/**
 * Tracks a value in a seen-map and returns a duplicate message if already present.
 *
 * @param seen - Map tracking previously seen keys to their owners.
 * @param key - The key to check for uniqueness.
 * @param owner - The owner label to associate with this key.
 * @param label - Human-readable label for the duplicate kind (e.g. "code" or "id").
 * @returns A duplicate description string, or `undefined` if the key is new.
 */
const trackDuplicate = (
	seen: Map<string, string>,
	key: string,
	owner: string,
	label: string
): string | undefined => {
	const prev = seen.get(key);
	if (prev === undefined) {
		seen.set(key, owner);
		return undefined;
	}
	return `duplicate ${label} "${key}" in entry "${owner}" (first seen in "${prev}")`;
};

/**
 * Checks a single entry for duplicate code and id, appending any violations.
 *
 * @param entry - The catalog entry to check.
 * @param seenCodes - Map tracking previously seen codes.
 * @param seenIds - Map tracking previously seen ids.
 * @param out - Array to append duplicate messages to.
 */
const checkEntryDuplicates = (
	entry: ErrorCatalogEntry,
	seenCodes: Map<string, string>,
	seenIds: Map<string, string>,
	out: string[]
): void => {
	const codeDup = trackDuplicate(seenCodes, entry.code, entry.id, "code");
	if (codeDup) {
		out.push(codeDup);
	}
	const idDup = trackDuplicate(seenIds, entry.id, entry.code, "id");
	if (idDup) {
		out.push(idDup);
	}
};

/**
 * Collects duplicate code/id violations from a list of catalog entries.
 *
 * @param entries - Enriched catalog entries to validate.
 * @returns List of human-readable duplicate descriptions (empty when valid).
 */
const collectDuplicates = (entries: readonly ErrorCatalogEntry[]): string[] => {
	const seenCodes = new Map<string, string>();
	const seenIds = new Map<string, string>();
	const duplicates: string[] = [];
	for (const entry of entries) {
		checkEntryDuplicates(entry, seenCodes, seenIds, duplicates);
	}
	return duplicates;
};

/**
 * Builds lookup tables from validated catalog entries.
 *
 * @param entries - Enriched catalog entries.
 * @typeParam TEntries - Tuple of catalog entries used to build the registry.
 * @returns `byCode` and `byId` record maps.
 */
const buildLookups = <
	const TEntries extends readonly [
		ErrorCatalogInputEntry<string, ErrorId>,
		...ErrorCatalogInputEntry<string, ErrorId>[],
	],
>(
	entries: readonly ErrorCatalogEntry<
		TEntries[number]["code"],
		TEntries[number]["id"]
	>[]
) => {
	const byCode = Object.create(null) as Record<
		TEntries[number]["code"],
		ErrorCatalogEntry<TEntries[number]["code"], TEntries[number]["id"]>
	>;
	for (const entry of entries) {
		byCode[entry.code] = entry;
	}
	const byId = Object.create(null) as Record<
		TEntries[number]["id"],
		ErrorCatalogEntry<TEntries[number]["code"], TEntries[number]["id"]>
	>;
	for (const entry of entries) {
		byId[entry.id] = entry;
	}
	return { byCode, byId };
};

/**
 * Creates a typed error registry from catalog entries.
 *
 * @param options - Registry construction options and fallback behavior.
 * @typeParam TEntries - Tuple of catalog entries used to build the registry.
 * @returns Indexed error registry keyed by code and ID.
 */
export const createErrorRegistry = <
	const TEntries extends readonly [
		ErrorCatalogInputEntry<string, ErrorId>,
		...ErrorCatalogInputEntry<string, ErrorId>[],
	],
>(options: {
	readonly docsBaseUrl: string;
	readonly entries: TEntries;
	readonly fallbackCode: TEntries[number]["code"];
}): ErrorRegistry<TEntries[number]["code"], TEntries[number]["id"]> => {
	const entries = options.entries.map((entry) =>
		toCatalogEntry(entry, options.docsBaseUrl)
	);

	const duplicates = collectDuplicates(entries);
	if (duplicates.length > 0) {
		throw new Error(
			`ErrorCatalog contains duplicates:\n  - ${duplicates.join("\n  - ")}`
		);
	}

	const { byCode, byId } = buildLookups<TEntries>(entries);
	const fallbackEntry = byCode[options.fallbackCode];
	if (fallbackEntry === undefined) {
		throw new Error(
			`Fallback code "${options.fallbackCode}" is not present in ErrorCatalog entries.`
		);
	}
	return {
		byCode,
		byId,
		codes: entries.map((entry) => entry.code) as CatalogCodesTuple<TEntries>,
		entries,
		resolve: (code) =>
			byCode[code as TEntries[number]["code"]] ?? fallbackEntry,
	};
};

/**
 * Checks whether a runtime code belongs to a known code set.
 *
 * @param codes - Set of known error codes.
 * @param code - Runtime code string to validate.
 * @typeParam TCode - Known code union represented by the set.
 * @returns `true` when `code` exists in `codes`.
 */
export const isKnownErrorCode = <TCode extends string>(
	codes: ReadonlySet<TCode>,
	code: string
): code is TCode => codes.has(code as TCode);
