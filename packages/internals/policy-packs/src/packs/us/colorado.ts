import { usChangelog } from "../../changelogs/us";
import {
	createCommonSections,
	createLaunchPack,
	getChangelogEntry,
} from "../shared";

const version = "1.0.0";

/**
 * Colorado policy pack (`launch-us-colorado` v1.0.0) aligned with:
 *
 * - **CPA** (C.R.S. § 6-1-1301 et seq. — Colorado Privacy Act,
 *   effective 1 July 2023)
 *
 * Enforces a 45-calendar-day response deadline with up to 45 additional
 * days of justified extension. Clarification stops the clock;
 * verification does not. Verification is required for high-risk
 * requests. Appeals must include AG contact info when denied.
 */
export const usColoradoPack = createLaunchPack({
	changelog: getChangelogEntry(usChangelog, version),
	effectiveAt: "2026-01-01T00:00:00.000Z",
	jurisdiction: "us-co",
	name: "launch-us-colorado",
	publishedAt: "2026-01-01T00:00:00.000Z",
	sections: createCommonSections({
		appeals: {
			deadlineDays: 45,
			extensionDays: 45,
			mustIncludeAGContactIfDenied: true,
		},
		clock: {
			clarificationEffect: "stop_clock",
			extension: {
				enabled: true,
				maxAdditionalDays: 45,
				requiresJustification: true,
			},
			responseDeadlineDays: 45,
			verificationEffect: "no_stop_clock",
		},
		verification: {
			requiredWhen: "high_risk",
		},
	}),
	version,
});
