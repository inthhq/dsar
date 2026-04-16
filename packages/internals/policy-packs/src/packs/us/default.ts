import { usChangelog } from "../../changelogs/us";
import {
	createCommonSections,
	createLaunchPack,
	getChangelogEntry,
} from "../shared";

const version = "1.0.0";

/**
 * US federal default policy pack (`launch-us` v1.0.0) aligned with:
 *
 * - **FTC Act** (15 U.S.C. §§ 41–58 — Federal Trade Commission Act,
 *   Section 5 unfair/deceptive practices authority)
 * - **Privacy Act of 1974** (5 U.S.C. § 552a — federal-agency privacy
 *   baseline, informing private-sector best practices)
 *
 * Enforces a 45-calendar-day response deadline with up to 45 additional
 * days of justified extension. Clarification and verification phases do
 * not stop the clock. Appeals must include AG contact info when denied.
 * State-specific packs (California, Virginia, Colorado) override these
 * defaults for their jurisdictions.
 */
export const usDefaultPack = createLaunchPack({
	changelog: getChangelogEntry(usChangelog, version),
	effectiveAt: "2026-01-01T00:00:00.000Z",
	jurisdiction: "us",
	name: "launch-us",
	publishedAt: "2026-01-01T00:00:00.000Z",
	sections: createCommonSections({
		appeals: {
			mustIncludeAGContactIfDenied: true,
		},
		clock: {
			clarificationEffect: "no_stop_clock",
			extension: {
				enabled: true,
				maxAdditionalDays: 45,
				requiresJustification: true,
			},
			responseDeadlineDays: 45,
			verificationEffect: "no_stop_clock",
		},
	}),
	version,
});
