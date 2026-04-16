import { euDefaultPack } from "./eu";
import type { LaunchPackSource } from "./shared";
import { ukDefaultPack } from "./uk";
import {
	usCaliforniaPack,
	usColoradoPack,
	usDefaultPack,
	usVirginiaPack,
} from "./us";

/**
 * Built-in policy pack catalog shipping with the platform. Each pack
 * encodes DSAR compliance rules aligned with its jurisdiction's
 * governing privacy legislation:
 *
 * | Pack | Jurisdiction | Aligned Legislation |
 * | ---- | ------------ | ------------------- |
 * | `launch-uk` | UK | UK GDPR, DPA 2018, Data (Use and Access) Act 2025 |
 * | `launch-eu` | EU | GDPR (Regulation (EU) 2016/679) |
 * | `launch-us` | US (federal) | FTC Act (15 U.S.C. §§ 41–58), Privacy Act of 1974 |
 * | `launch-us-california` | US-CA | CCPA / CPRA (Cal. Civ. Code § 1798.100 et seq.) |
 * | `launch-us-virginia` | US-VA | VCDPA (Va. Code § 59.1-575 et seq.) |
 * | `launch-us-colorado` | US-CO | CPA (C.R.S. § 6-1-1301 et seq.) |
 *
 * Used by the registry to seed available packs when no custom
 * configuration is provided.
 */
export const launchPolicyPackCatalog: readonly LaunchPackSource[] = [
	ukDefaultPack,
	euDefaultPack,
	usDefaultPack,
	usCaliforniaPack,
	usVirginiaPack,
	usColoradoPack,
];

export {
	euDefaultPack,
	ukDefaultPack,
	usCaliforniaPack,
	usColoradoPack,
	usDefaultPack,
	usVirginiaPack,
};

export type { ChangelogEntry, LaunchPackSource } from "./shared";
