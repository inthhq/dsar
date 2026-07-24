import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
	...ultracite,
	ignorePatterns: [
		...(ultracite.ignorePatterns ?? []),
		"**/.agents/**",
		"**/.claude/**",
		"**/*.md",
		"**/*.mdx",
		"skills-lock.json",
	],
	useTabs: true,
});
