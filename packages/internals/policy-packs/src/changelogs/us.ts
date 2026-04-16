import type { ChangelogEntry } from "../packs/shared";

/**
 * Versioned changelog entries for the US policy packs (baseline, CCPA, VCDPA,
 * CPA).
 */
export const usChangelog: Record<string, ChangelogEntry> = {
	"1.0.0": {
		compatibilityNotes:
			"Initial US launch set: baseline US profile plus CA CCPA, VA VCDPA, and CO CPA variants.",
		releaseType: "major",
		summary:
			"Initial US launch with state-aware rights timing defaults and appeals expectations.",
		version: "1.0.0",
	},
};
