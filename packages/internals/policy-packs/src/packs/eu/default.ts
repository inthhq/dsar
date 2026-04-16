import { euChangelog } from "../../changelogs/eu";
import {
	createCommonSections,
	createLaunchPack,
	getChangelogEntry,
} from "../shared";

const version = "1.0.0";

/**
 * EU default policy pack (`launch-eu` v1.0.0) aligned with:
 *
 * - **GDPR** (Regulation (EU) 2016/679 — General Data Protection Regulation)
 *
 * Enforces a 30-calendar-day response deadline with up to 60 additional
 * days of justified extension. Clarification stops the clock;
 * verification does not. Included in the
 * {@link launchPolicyPackCatalog} and used as the baseline pack for
 * `jurisdiction: "eu"` requests.
 */
export const euDefaultPack = createLaunchPack({
	changelog: getChangelogEntry(euChangelog, version),
	effectiveAt: "2026-01-01T00:00:00.000Z",
	jurisdiction: "eu",
	name: "launch-eu",
	publishedAt: "2026-01-01T00:00:00.000Z",
	sections: createCommonSections({
		clock: {
			clarificationEffect: "stop_clock",
			extension: {
				enabled: true,
				maxAdditionalDays: 60,
				requiresJustification: true,
			},
			responseDeadlineDays: 30,
			verificationEffect: "no_stop_clock",
		},
	}),
	version,
});
