import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

const relativeParentImportPackages = [
	"packages/backend/**/*.{js,jsx,ts,tsx}",
	"packages/cli/**/*.{js,jsx,ts,tsx}",
	"packages/internals/persistence/**/*.{js,jsx,ts,tsx}",
	"packages/internals/policy-engine/**/*.{js,jsx,ts,tsx}",
	"packages/internals/policy-packs/**/*.{js,jsx,ts,tsx}",
	"packages/node-sdk/**/*.{js,jsx,ts,tsx}",
	"packages/storage-filesystem/**/*.{js,jsx,ts,tsx}",
	"packages/storage-s3/**/*.{js,jsx,ts,tsx}",
	"packages/storage-vercel-blob/**/*.{js,jsx,ts,tsx}",
];

export default defineConfig({
	extends: [core],
	ignorePatterns: core.ignorePatterns,
	overrides: [
		{
			files: [
				"**/*.{test,spec}.{ts,tsx,js,jsx}",
				"**/__tests__/**/*.{ts,tsx,js,jsx}",
			],
			rules: {
				"jest/no-standalone-expect": "off",
				"jest/require-hook": "off",
				"jest/valid-title": "off",
				"vitest/no-importing-vitest-globals": "off",
			},
		},
		{
			files: relativeParentImportPackages,
			rules: {
				"import/no-relative-parent-imports": "off",
			},
		},
		{
			files: [
				"packages/backend/**/*.{js,jsx,ts,tsx}",
				"packages/internals/persistence/**/*.{js,jsx,ts,tsx}",
				"packages/internals/policy-engine/**/*.{js,jsx,ts,tsx}",
				"packages/internals/policy-packs/**/*.{js,jsx,ts,tsx}",
			],
			rules: {
				"max-classes-per-file": "off",
				"max-statements": "off",
				"oxc/no-barrel-file": "off",
			},
		},
		{
			files: [
				"packages/backend/**/*.{js,jsx,ts,tsx}",
				"packages/internals/persistence/**/*.{js,jsx,ts,tsx}",
			],
			rules: {
				"jest/valid-title": "off",
				"unicorn/no-array-method-this-argument": "off",
			},
		},
		{
			files: [
				"packages/dsar/**/*.{js,jsx,ts,tsx}",
				"packages/internals/schema/**/*.{js,jsx,ts,tsx}",
			],
			rules: {
				"oxc/no-barrel-file": "off",
			},
		},
		{
			files: ["packages/backend/**/*.{js,jsx,ts,tsx}"],
			rules: {
				"unicorn/prefer-response-static-json": "off",
			},
		},
		{
			files: ["packages/internals/policy-engine/**/*.{js,jsx,ts,tsx}"],
			rules: {
				"import/no-nodejs-modules": "off",
				"jest/prefer-each": "off",
				"unicorn/no-array-reverse": "off",
				"unicorn/no-array-sort": "off",
			},
		},
		{
			files: ["packages/internals/policy-packs/**/*.{js,jsx,ts,tsx}"],
			rules: {
				"no-shadow": "off",
				"unicorn/no-array-method-this-argument": "off",
			},
		},
	],
	rules: {
		"import/no-nodejs-modules": "off",
		"jsdoc/check-tag-names": "off",
		"jsdoc/require-param-type": "off",
		"jsdoc/require-returns-type": "off",
		"jsdoc/require-throws-type": "off",
		"no-await-in-loop": "off",
		"no-restricted-imports": [
			"error",
			{
				paths: [
					{
						allowTypeImports: true,
						message:
							"Import from specific modules instead (e.g. effect/Effect, effect/Stream).",
						name: "effect",
					},
				],
			},
		],
		"prefer-named-capture-group": "off",
		"promise/prefer-await-to-callbacks": "off",
		"promise/prefer-await-to-then": "off",
		"require-unicode-regexp": "off",
		"unicorn/consistent-function-scoping": "off",
		"unicorn/custom-error-definition": "off",
		"unicorn/import-style": "off",
		"unicorn/no-array-for-each": "off",
		"unicorn/prefer-export-from": "off",
		"unicorn/prefer-number-coercion": "off",
		"unicorn/prefer-single-call": "off",
		"unicorn/text-encoding-identifier-case": "off",
		"vitest/no-importing-vitest-globals": "off",
	},
});
