import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["scripts/**/*.test.ts"],
		testTimeout: 60_000,
	},
});
