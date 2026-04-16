import { defineConfig } from "tsdown";

export default defineConfig({
	attw: { enabled: "ci-only", profile: "esm-only" },
	clean: true,
	dts: true,
	failOnWarn: "ci-only",
	fixedExtension: true,
	format: "esm",
	publint: "ci-only",
});
