import { ukChangelog } from "../../changelogs/uk";
import {
	createCommonSections,
	createLaunchPack,
	getChangelogEntry,
} from "../shared";

const version = "1.0.0";

/**
 * UK default policy pack (`launch-uk` v1.0.0) aligned with:
 *
 * - **UK GDPR** (retained EU Regulation 2016/679 as amended by the
 *   Data Protection, Privacy and Electronic Communications (Amendments
 *   etc) (EU Exit) Regulations 2019)
 * - **Data Protection Act 2018** (DPA 2018)
 * - **Data (Use and Access) Act 2025**
 *
 * Enforces a 30-calendar-day response deadline with up to 60 additional
 * days of justified extension. Included in the
 * {@link launchPolicyPackCatalog} and used as the baseline pack for
 * `jurisdiction: "uk"` requests.
 */
export const ukDefaultPack = createLaunchPack({
	changelog: getChangelogEntry(ukChangelog, version),
	effectiveAt: "2026-01-01T00:00:00.000Z",
	jurisdiction: "uk",
	name: "launch-uk",
	publishedAt: "2026-01-01T00:00:00.000Z",
	sections: createCommonSections({
		appeals: {
			mustIncludeAGContactIfDenied: false,
		},
		clock: {
			extension: {
				enabled: true,
				maxAdditionalDays: 60,
				requiresJustification: true,
			},
			responseDeadlineDays: 30,
		},
	}),
	version,
});
