import { usChangelog } from "../../changelogs/us";
import {
	createCommonSections,
	createLaunchPack,
	getChangelogEntry,
} from "../shared";

const version = "1.0.0";

/**
 * California policy pack (`launch-us-california` v1.0.0) aligned with:
 *
 * - **CCPA** (Cal. Civ. Code § 1798.100 et seq. — California Consumer
 *   Privacy Act of 2018)
 * - **CPRA** (California Privacy Rights Act of 2020, amending the CCPA)
 *
 * Enforces a 45-calendar-day response deadline with up to 45 additional
 * days of justified extension. Neither clarification nor verification
 * stops the clock. Verification is policy-controlled. Appeals must
 * include AG contact info when denied.
 */
export const usCaliforniaPack = createLaunchPack({
	changelog: getChangelogEntry(usChangelog, version),
	effectiveAt: "2026-01-01T00:00:00.000Z",
	jurisdiction: "us-ca",
	name: "launch-us-california",
	publishedAt: "2026-01-01T00:00:00.000Z",
	sections: createCommonSections({
		appeals: {
			deadlineDays: 45,
			extensionDays: 45,
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
		verification: {
			requiredWhen: "policy_controlled",
		},
	}),
	version,
});
