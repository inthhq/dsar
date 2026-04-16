import type { ChangelogEntry } from "../packs/shared";

/**
 * Versioned changelog entries for the EU (GDPR) policy pack.
 */
export const euChangelog: Record<string, ChangelogEntry> = {
	"1.0.0": {
		compatibilityNotes:
			"Initial EU launch profile with one-month base deadline, clarification pauses, and controlled extensions.",
		releaseType: "major",
		summary:
			"Initial EU pack covering GDPR subject rights baseline handling and explainability requirements.",
		version: "1.0.0",
	},
};
