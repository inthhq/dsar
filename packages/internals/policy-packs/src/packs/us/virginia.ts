import { usChangelog } from "../../changelogs/us";
import {
	createCommonSections,
	createLaunchPack,
	getChangelogEntry,
} from "../shared";

const version = "1.0.0";

/**
 * Virginia policy pack (`launch-us-virginia` v1.0.0) aligned with:
 *
 * - **VCDPA** (Va. Code § 59.1-575 et seq. — Virginia Consumer Data
 *   Protection Act, effective 1 January 2023)
 *
 * Enforces a 45-calendar-day response deadline with up to 45 additional
 * days of justified extension. Both clarification and verification stop
 * the clock. Appeals have a 60-day deadline with 30-day extension and
 * must include AG contact info when denied.
 */
export const usVirginiaPack = createLaunchPack({
	changelog: getChangelogEntry(usChangelog, version),
	effectiveAt: "2026-01-01T00:00:00.000Z",
	jurisdiction: "us-va",
	name: "launch-us-virginia",
	publishedAt: "2026-01-01T00:00:00.000Z",
	sections: createCommonSections({
		appeals: {
			deadlineDays: 60,
			extensionDays: 30,
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
			verificationEffect: "stop_clock",
		},
		verification: {
			requiredWhen: "when_authority_missing",
		},
	}),
	version,
});
