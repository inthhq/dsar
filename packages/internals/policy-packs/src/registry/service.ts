import { PolicyPackSchema } from "@dsar/policy-engine";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import { launchPolicyPackCatalog } from "../packs";
import type { PolicyPackVersionRecord } from "../types/domain";
import type { PolicyChecksumComputationError } from "../types/errors";
import {
	InvalidPolicyPackSchemaError,
	PolicyChecksumMismatchError,
	PolicyVersionAlreadyExistsError,
	PolicyVersionMetadataError,
	PolicyVersionNotFoundError,
} from "../types/errors";
import { computePolicyPackChecksum } from "./checksum";

const versionKey = (record: { jurisdiction: string; version: string }) =>
	`${record.jurisdiction}:${record.version}`;

/**
 * Service contract for managing policy-pack version registration, retrieval,
 * and listing within the in-memory registry.
 */
export interface PolicyRegistryService {
	/**
	 * Validates and stores a {@link PolicyPackVersionRecord}. The pack schema,
	 * metadata (semver ordering, changelog, compatibility notes), and checksum
	 * are verified before insertion.
	 *
	 * @param record - Version record to publish.
	 * @returns An `Effect` that succeeds with `void` on success, or fails with
	 *   {@link PolicyVersionAlreadyExistsError} if the version is already
	 *   registered, {@link InvalidPolicyPackSchemaError} if the pack payload
	 *   fails schema validation, {@link PolicyChecksumMismatchError} if the
	 *   recorded checksum does not match the computed one,
	 *   {@link PolicyChecksumComputationError} if the checksum cannot be
	 *   computed, or {@link PolicyVersionMetadataError} if metadata constraints
	 *   are violated.
	 */
	readonly publish: (
		record: PolicyPackVersionRecord
	) => Effect.Effect<
		void,
		| PolicyVersionAlreadyExistsError
		| InvalidPolicyPackSchemaError
		| PolicyChecksumMismatchError
		| PolicyChecksumComputationError
		| PolicyVersionMetadataError
	>;
	/**
	 * Retrieves a single {@link PolicyPackVersionRecord} by jurisdiction and
	 * version.
	 *
	 * @param jurisdiction - Jurisdiction code scoping the lookup.
	 * @param version - Exact semantic version to retrieve.
	 * @returns An `Effect` yielding the matching record, or failing with
	 *   {@link PolicyVersionNotFoundError} when no record exists for the
	 *   given jurisdiction/version pair.
	 */
	readonly getByVersion: (
		jurisdiction: string,
		version: string
	) => Effect.Effect<PolicyPackVersionRecord, PolicyVersionNotFoundError>;
	/**
	 * Lists all {@link PolicyPackVersionRecord} entries registered under a
	 * jurisdiction.
	 *
	 * @param jurisdiction - Jurisdiction code to filter by.
	 * @returns An `Effect` yielding the (possibly empty) array of version
	 *   records.
	 */
	readonly listByJurisdiction: (
		jurisdiction: string
	) => Effect.Effect<readonly PolicyPackVersionRecord[]>;
}

/**
 * Effect service tag for injecting a {@link PolicyRegistryService}
 * implementation into the dependency graph.
 */
export class PolicyRegistry extends Context.Service<
	PolicyRegistry,
	PolicyRegistryService
>()("PolicyRegistry") {}

interface ParsedSemver {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
}

const semverPattern = /^\d+\.\d+\.\d+$/;

const parseSemver = (
	version: string
): Effect.Effect<ParsedSemver, PolicyVersionMetadataError> => {
	if (!semverPattern.test(version)) {
		return Effect.fail(
			new PolicyVersionMetadataError({
				message: `Version "${version}" must follow semantic versioning x.y.z`,
			})
		);
	}

	const [rawMajor, rawMinor, rawPatch] = version
		.split(".")
		.map((part) => Number.parseInt(part, 10));
	if (
		rawMajor === undefined ||
		rawMinor === undefined ||
		rawPatch === undefined ||
		Number.isNaN(rawMajor) ||
		Number.isNaN(rawMinor) ||
		Number.isNaN(rawPatch)
	) {
		return Effect.fail(
			new PolicyVersionMetadataError({
				message: `Version "${version}" must include numeric major/minor/patch segments`,
			})
		);
	}
	return Effect.succeed({
		major: rawMajor,
		minor: rawMinor,
		patch: rawPatch,
	});
};

const compareSemver = (left: ParsedSemver, right: ParsedSemver) => {
	if (left.major !== right.major) {
		return left.major - right.major;
	}
	if (left.minor !== right.minor) {
		return left.minor - right.minor;
	}
	return left.patch - right.patch;
};

const expectedReleaseType = (
	from: ParsedSemver,
	to: ParsedSemver
): "major" | "minor" | "patch" | "none" => {
	if (to.major > from.major) {
		return "major";
	}
	if (to.minor > from.minor) {
		return "minor";
	}
	if (to.patch > from.patch) {
		return "patch";
	}
	return "none";
};

const formatParseIssue = (issue: string) => issue;

const ensurePackSchemaValid = (
	record: PolicyPackVersionRecord
): Effect.Effect<void, InvalidPolicyPackSchemaError> => {
	const decoded = Schema.decodeUnknownExit(PolicyPackSchema)(record.pack);
	if (Exit.isFailure(decoded)) {
		return Effect.fail(
			new InvalidPolicyPackSchemaError({
				message: `Policy pack "${record.name}" failed schema validation: ${formatParseIssue(Cause.pretty(decoded.cause))}`,
			})
		);
	}
	return Effect.void;
};

const ensureMetadataValid = (
	record: PolicyPackVersionRecord,
	currentRecords: readonly PolicyPackVersionRecord[]
): Effect.Effect<void, PolicyVersionMetadataError> =>
	Effect.gen(function* ensureMetadataValid() {
		const changelog = record.metadata.changelog.trim();
		const compatibilityNotes = record.metadata.compatibilityNotes.trim();
		if (changelog.length === 0) {
			return yield* Effect.fail(
				new PolicyVersionMetadataError({
					message: `Policy pack "${record.name}" is missing changelog text`,
				})
			);
		}
		if (compatibilityNotes.length === 0) {
			return yield* Effect.fail(
				new PolicyVersionMetadataError({
					message: `Policy pack "${record.name}" is missing compatibility notes`,
				})
			);
		}

		const candidate = yield* parseSemver(record.version);
		const sameLine = currentRecords.filter(
			(entry) =>
				entry.jurisdiction === record.jurisdiction && entry.name === record.name
		);
		if (sameLine.length === 0) {
			return;
		}

		const parsed = yield* Effect.forEach(sameLine, (entry) =>
			Effect.map(parseSemver(entry.version), (value) => ({
				parsed: value,
				record: entry,
			}))
		);
		const [first, ...rest] = parsed;
		if (!first) {
			return;
		}
		let latest = first;
		for (const item of rest) {
			if (compareSemver(item.parsed, latest.parsed) > 0) {
				latest = item;
			}
		}

		if (compareSemver(candidate, latest.parsed) <= 0) {
			return yield* Effect.fail(
				new PolicyVersionMetadataError({
					message: `Version "${record.version}" must be greater than existing latest "${latest.record.version}" for "${record.name}"`,
				})
			);
		}

		const expected = expectedReleaseType(latest.parsed, candidate);
		if (expected === "none") {
			return yield* Effect.fail(
				new PolicyVersionMetadataError({
					message: `Version "${record.version}" must increment "${latest.record.version}"`,
				})
			);
		}
		if (expected !== record.metadata.releaseType) {
			return yield* Effect.fail(
				new PolicyVersionMetadataError({
					message: `Version "${record.version}" must be released as "${expected}", received "${record.metadata.releaseType}"`,
				})
			);
		}
	});

const ensureChecksumValid = (
	record: PolicyPackVersionRecord
): Effect.Effect<
	void,
	PolicyChecksumMismatchError | PolicyChecksumComputationError
> =>
	Effect.gen(function* ensureChecksumValid() {
		const expected = yield* computePolicyPackChecksum(record.pack);
		if (expected !== record.checksum) {
			return yield* Effect.fail(
				new PolicyChecksumMismatchError({
					actual: record.checksum,
					expected,
				})
			);
		}
	});

const makeLaunchRecords = (): Effect.Effect<
	readonly PolicyPackVersionRecord[],
	| InvalidPolicyPackSchemaError
	| PolicyChecksumComputationError
	| PolicyChecksumMismatchError
	| PolicyVersionMetadataError
> =>
	Effect.gen(function* makeLaunchRecords() {
		const records = yield* Effect.forEach(launchPolicyPackCatalog, (source) =>
			Effect.map(computePolicyPackChecksum(source.pack), (checksum) => ({
				checksum,
				jurisdiction: source.jurisdiction,
				metadata: source.metadata,
				name: source.name,
				pack: source.pack,
				publishedAt: source.publishedAt,
				version: source.pack.version,
			}))
		);

		const current: PolicyPackVersionRecord[] = [];
		for (const record of records) {
			yield* ensurePackSchemaValid(record);
			yield* ensureMetadataValid(record, current);
			yield* ensureChecksumValid(record);
			current.push(record);
		}
		return records;
	});

/**
 * In-memory {@link PolicyRegistry} layer seeded with the built-in launch
 * policy packs. Each pack is schema-validated and checksum-verified at
 * construction time.
 */
export const PolicyRegistryLive = Layer.effect(PolicyRegistry)(
	Effect.gen(function* PolicyRegistryLive() {
		const launchRecords = yield* makeLaunchRecords();
		const store = yield* Ref.make(
			new Map<string, PolicyPackVersionRecord>(
				launchRecords.map((record) => [versionKey(record), record])
			)
		);

		return {
			getByVersion: (jurisdiction, version) =>
				Effect.gen(function* getByVersion() {
					const key = versionKey({ jurisdiction, version });
					const value = yield* Ref.get(store).pipe(
						Effect.map((map) => map.get(key))
					);
					if (!value) {
						return yield* Effect.fail(
							new PolicyVersionNotFoundError({ version })
						);
					}
					return value;
				}),
			listByJurisdiction: (jurisdiction) =>
				Ref.get(store).pipe(
					Effect.map((map) =>
						[...map.values()].filter(
							(record) => record.jurisdiction === jurisdiction
						)
					)
				),
			publish: (record) =>
				Effect.gen(function* publish() {
					const current = yield* Ref.get(store).pipe(
						Effect.map((map) => [...map.values()])
					);
					yield* ensurePackSchemaValid(record);
					yield* ensureMetadataValid(record, current);
					yield* ensureChecksumValid(record);

					const key = versionKey(record);
					const inserted = yield* Ref.modify(store, (current) => {
						if (current.has(key)) {
							return [false, current] as const;
						}
						return [true, new Map(current).set(key, record)] as const;
					});
					if (!inserted) {
						return yield* Effect.fail(
							new PolicyVersionAlreadyExistsError({ version: record.version })
						);
					}
				}),
		} satisfies PolicyRegistryService;
	})
);
