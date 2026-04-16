import type { PolicyPack } from "@dsar/policy-engine";

import type {
	CompatibilityLevel,
	PolicyPackVersionMetadata,
} from "../types/domain";

/**
 * Source fields required to construct a launch policy pack.
 */
export interface LaunchPackSource {
	/** Logical name of the policy pack family. */
	readonly name: string;
	/** Jurisdiction code the pack targets. */
	readonly jurisdiction: string;
	/** Concrete policy-pack document to publish. */
	readonly pack: PolicyPack;
	/** Timestamp when this policy version was published. */
	readonly publishedAt: string;
	/** Release metadata recorded with the published version. */
	readonly metadata: PolicyPackVersionMetadata;
}

/**
 * Changelog entry describing one policy-pack release.
 */
export interface ChangelogEntry {
	/** Version label shown in release history. */
	readonly version: string;
	/** Compatibility category for this release. */
	readonly releaseType: CompatibilityLevel;
	/** Upgrade or compatibility guidance for adopters. */
	readonly compatibilityNotes: string;
	/** Human-readable summary of the policy changes. */
	readonly summary: string;
}

type ClockOverrides = Partial<PolicyPack["sections"]["clock"]> & {
	/** Optional override for extension policy behavior. */
	readonly extension?: Partial<PolicyPack["sections"]["clock"]["extension"]>;
};

interface SectionOverrides {
	/** Appeals section overrides (deadlines, mandatory contact requirements). */
	readonly appeals?: Partial<PolicyPack["sections"]["appeals"]>;
	/** Audit section overrides (traceability / explainability requirements). */
	readonly audit?: Partial<PolicyPack["sections"]["audit"]>;
	/** Clock section overrides (ack windows, stop-clock semantics, rule set). */
	readonly clock?: ClockOverrides;
	/** Delivery section overrides (channels, security level, token TTL). */
	readonly delivery?: Partial<PolicyPack["sections"]["delivery"]>;
	/** Representation section overrides for authority evidence behavior. */
	readonly representation?: Partial<PolicyPack["sections"]["representation"]>;
	/** Response section overrides for format and manifest requirements. */
	readonly response?: Partial<PolicyPack["sections"]["response"]>;
	/** Retention section overrides, including per-artifact minimum windows. */
	readonly retention?: Partial<PolicyPack["sections"]["retention"]> & {
		/** Fine-grained retention minimums by artifact type. */
		readonly minimums?: Partial<
			PolicyPack["sections"]["retention"]["minimums"]
		>;
	};
	/** Verification section overrides for trigger policy and allowed methods. */
	readonly verification?: Partial<PolicyPack["sections"]["verification"]>;
}

interface CreateLaunchPackInput {
	readonly name: string;
	readonly jurisdiction: string;
	readonly version: string;
	readonly effectiveAt: string;
	readonly publishedAt: string;
	readonly changelog: ChangelogEntry;
	readonly sections: PolicyPack["sections"];
}

/**
 * Builds a launch policy-pack source object from release inputs.
 *
 * @param input - Policy-pack release inputs used to construct the source payload.
 * @returns Launch-pack source object ready for publishing.
 */
export const createLaunchPack = (
	input: CreateLaunchPackInput
): LaunchPackSource => ({
	jurisdiction: input.jurisdiction,
	metadata: {
		changelog: input.changelog.summary,
		compatibilityNotes: input.changelog.compatibilityNotes,
		releaseType: input.changelog.releaseType,
	},
	name: input.name,
	pack: {
		effectiveAt: input.effectiveAt,
		jurisdiction: input.jurisdiction,
		packId: `${input.name}-${input.jurisdiction}`,
		sections: input.sections,
		version: input.version,
	},
	publishedAt: input.publishedAt,
});

const baseMinimums: PolicyPack["sections"]["retention"]["minimums"] = {
	audit_event: 730,
	delivery_log: 365,
	fulfilment_artifact: 365,
	notification_log: 365,
	request_record: 730,
	verification_evidence: 90,
};

/**
 * Builds a complete policy-pack `sections` object with DSAR defaults.
 *
 * @param input - Optional per-section overrides layered on top of defaults.
 * @returns Fully-populated policy-pack sections object.
 */
export const createCommonSections = (
	input: SectionOverrides = {}
): PolicyPack["sections"] => ({
	appeals: {
		deadlineDays: 45,
		extensionDays: 60,
		mustBeEasyAsOriginalRequest: true,
		mustIncludeAGContactIfDenied: true,
		required: true,
		...input.appeals,
	},
	audit: {
		requireClockExplainability: true,
		requireRuleTrace: true,
		...input.audit,
	},
	clock: {
		ackDeadlineBusinessDays: 10,
		ackRequired: true,
		clarificationEffect: "stop_clock",
		extension: {
			enabled: true,
			maxAdditionalDays: 60,
			requiresJustification: true,
			...input.clock?.extension,
		},
		responseDeadlineDays: 30,
		rules: [],
		start: "receipt",
		verificationEffect: "stop_clock",
		...input.clock,
	},
	delivery: {
		allowedChannels: ["portal", "email", "secure_remote_access"],
		securityLevel: "token",
		stepUpRequired: false,
		tokenTtlSeconds: 86_400,
		...input.delivery,
	},
	representation: {
		authorityEvidenceRequiredFor: ["representative", "authorised_agent"],
		enableDeliveryTargeting: true,
		...input.representation,
	},
	response: {
		allowedMediaTypes: ["application/json", "text/csv"],
		preferredFormatCapture: true,
		requireDownloadableCopyForRemoteAccess: true,
		requireManifest: true,
		...input.response,
	},
	retention: {
		minimums: {
			...baseMinimums,
			...input.retention?.minimums,
		},
		verificationDeleteAfterProcessing: true,
		...input.retention,
	},
	verification: {
		allowedMethods: ["existing_auth", "email_link", "manual"],
		deleteCollectedDataAfterProcessing: true,
		redactionSupported: true,
		requiredWhen: "when_authority_missing",
		...input.verification,
	},
});

/**
 * Retrieves a required changelog entry by version.
 *
 * @param changelog - Changelog map keyed by version.
 * @param version - Version to resolve from the changelog map.
 * @returns Changelog entry for the requested version.
 * @throws Error when the requested version is missing from the changelog.
 */
export const getChangelogEntry = (
	changelog: Record<string, ChangelogEntry>,
	version: string
): ChangelogEntry => {
	const entry = changelog[version];
	if (!entry) {
		throw new Error(`Missing changelog entry for version "${version}"`);
	}
	return entry;
};
