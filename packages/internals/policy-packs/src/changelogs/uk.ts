import type { ChangelogEntry } from "../packs/shared";

/**
 * Changelog for the UK policy pack.
 */
export const ukChangelog: Record<string, ChangelogEntry> = {
	"1.0.0": {
		compatibilityNotes:
			"Initial UK launch profile with one-month base deadline and two-month extension cap.",
		releaseType: "major",
		summary:
			"Initial UK pack covering access, deletion, correction, and objection baseline handling.",
		version: "1.0.0",
	},
};
