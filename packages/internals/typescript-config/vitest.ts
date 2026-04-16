import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		setupFiles: ["@dsar/typescript-config/vitest-setup"],
	},
});
