import { execFileSync } from "node:child_process";
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Tegami } from "tegami";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";

import {
	checkReleaseVersion,
	createRelease,
	prePublishScripts,
	releaseLine,
	runReleaseCli,
	syncBunLockVersions,
} from "./tegami";

const roots: string[] = [];
const repository = fileURLToPath(new URL("..", import.meta.url));
const commit = "a".repeat(40);

interface Manifest {
	readonly dependencies?: Record<string, string>;
	readonly devDependencies?: Record<string, string>;
	readonly files?: string[];
	readonly name: string;
	readonly private?: boolean;
	readonly version?: string;
}

const directoryOf = (name: string): string => name.replace("@dsar/", "");

const write = (root: string, path: string, content: string): void => {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), content);
};

const fixture = (manifests: readonly Manifest[]): string => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "dsar-tegami-")));
	roots.push(root);
	write(
		root,
		"package.json",
		JSON.stringify({
			name: "fixture",
			private: true,
			workspaces: ["packages/*"],
		})
	);
	for (const manifest of manifests) {
		write(
			root,
			`packages/${directoryOf(manifest.name)}/package.json`,
			JSON.stringify(manifest)
		);
	}
	return root;
};

const change = (
	root: string,
	packages: Record<string, unknown>,
	name = "change"
): void => {
	write(
		root,
		`.tegami/${name}.md`,
		`---\n${stringify({ packages })}---\n\n### ${name}\n\nRelease notes for ${name}.\n`
	);
};

const readManifest = (root: string, directory: string): Manifest =>
	JSON.parse(
		readFileSync(join(root, `packages/${directory}/package.json`), "utf8")
	) as Manifest;

const release = (root: string, branch = "main"): Tegami =>
	createRelease({ branch, commit, cwd: root, github: false });

const applyDraft = async (instance: Tegami): Promise<void> => {
	const draft = await instance.draft();
	await draft.apply();
};

const hasPending = async (instance: Tegami): Promise<boolean> => {
	const draft = await instance.draft();
	return draft.hasPending();
};

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	for (const root of roots.splice(0)) {
		rmSync(root, { force: true, recursive: true });
	}
});

describe("release channels", () => {
	it.each([
		["main", "latest", undefined],
		["canary", "canary", `canary-${commit}`],
	])("maps %s to the %s npm tag", (branch, distTag, prerelease) => {
		expect(releaseLine(branch, commit)).toEqual({ distTag, prerelease });
	});

	it("rejects unknown branches and canaries without a commit", () => {
		expect(() => releaseLine("feature/test")).toThrow(
			"Unsupported release branch"
		);
		expect(() => releaseLine("canary")).toThrow("commit SHA");
	});

	it.each([
		["main", "1.0.0-canary.0"],
		["main", "1.0.0-beta.1"],
		["canary", "1.0.0"],
	])("rejects %s publishing %s", (branch, version) => {
		expect(() => checkReleaseVersion(branch, version)).toThrow(
			"not a valid release"
		);
	});
});

describe("versioning", () => {
	it("bumps dsar from its notes and leaves private workspaces alone", async () => {
		const root = fixture([
			{
				devDependencies: { "@dsar/backend": "workspace:*" },
				name: "dsar",
				version: "0.0.5",
			},
			{ name: "@dsar/backend", private: true, version: "0.0.5" },
		]);
		change(root, { dsar: "minor" }, "feature");
		change(root, { dsar: "patch" }, "fix");

		await applyDraft(release(root));

		expect(readManifest(root, "dsar").version).toBe("0.1.0");
		expect(readManifest(root, "backend").version).toBe("0.0.5");
		const changelog = readFileSync(
			join(root, "packages/dsar/CHANGELOG.md"),
			"utf8"
		);
		expect(changelog).toContain("feature");
		expect(changelog).toContain("fix");
		expect(existsSync(join(root, ".tegami/feature.md"))).toBe(false);
		expect(await hasPending(release(root))).toBe(false);
	});

	it("creates repeatable canary snapshots unique to each commit", async () => {
		const manifests = [{ name: "dsar", version: "1.0.0" }];
		const root = fixture(manifests);
		const retry = fixture(manifests);
		const next = fixture(manifests);

		await applyDraft(release(root, "canary"));
		await applyDraft(release(retry, "canary"));
		await applyDraft(
			createRelease({
				branch: "canary",
				commit: "b".repeat(40),
				cwd: next,
				github: false,
			})
		);

		expect(readManifest(root, "dsar").version).toBe(`1.0.1-canary-${commit}.0`);
		expect(readManifest(retry, "dsar").version).toBe(
			readManifest(root, "dsar").version
		);
		expect(readManifest(next, "dsar").version).not.toBe(
			readManifest(root, "dsar").version
		);
		expect(
			readFileSync(join(root, ".tegami/publish-lock.yaml"), "utf8")
		).toContain("distTag: canary");
	});
});

describe("publish lock validation", () => {
	it.each(["branch", "version", "tag", "latest", "missing"])(
		"rejects a mismatched %s before querying registries",
		async (kind) => {
			const root = fixture([{ name: "dsar", version: "1.0.0" }]);
			change(root, { dsar: "patch" });
			await applyDraft(release(root));
			const path = join(root, ".tegami/publish-lock.yaml");
			let lock = readFileSync(path, "utf8");
			if (kind === "branch") {
				lock = lock.replace("branch: main", "branch: canary");
			} else if (kind === "version") {
				lock = lock.replace("version: 1.0.1", "version: 1.0.2");
			} else if (kind === "tag") {
				lock = lock.replace("distTag: latest", "distTag: canary");
			} else if (kind === "latest") {
				lock += "\nnpm:mark-latest:\n  - id: npm:dsar\n";
			} else {
				const data = parse(lock) as Record<string, unknown>;
				delete data["dsar:release"];
				lock = stringify(data);
			}
			writeFileSync(path, lock);

			await expect(release(root).getPublishStatus()).rejects.toThrow(
				/Publish lock|not a valid release/u
			);
		}
	);

	it("refuses to publish a main lock from canary, including dry runs", async () => {
		const root = fixture([{ name: "dsar", version: "1.0.0" }]);
		change(root, { dsar: "patch" });
		await applyDraft(release(root));
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(new Response(null, { status: 404 })))
		);

		await expect(
			release(root, "canary").publish({ dryRun: true })
		).rejects.toThrow("does not belong to canary");
	});
});

describe("CI release retries", () => {
	it("publishes the pending release before drafting new notes", async () => {
		const root = fixture([{ name: "dsar", version: "1.0.0" }]);
		change(root, { dsar: "patch" }, "original");
		await applyDraft(release(root));
		const lockPath = join(root, ".tegami/publish-lock.yaml");
		const lock = readFileSync(lockPath, "utf8");
		change(root, { dsar: "patch" }, "later");
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(new Response(null, { status: 404 })))
		);
		const instance = release(root);
		// Exercise CLI dispatch without uploading the fixture to a registry.
		const publish = vi.spyOn(instance, "publish").mockResolvedValue("skipped");

		await runReleaseCli(instance, ["ci"]);

		expect(publish).toHaveBeenCalledOnce();
		expect(readFileSync(lockPath, "utf8")).toBe(lock);
		expect(readManifest(root, "dsar").version).toBe("1.0.1");
		expect(existsSync(join(root, ".tegami/later.md"))).toBe(true);
	});
});

describe("publishing through npm", () => {
	type FailingStep = (typeof prePublishScripts)[number];

	const publishFixture = (failing?: FailingStep): string => {
		const root = fixture([
			{
				devDependencies: { "@dsar/backend": "workspace:*" },
				files: ["dist"],
				name: "dsar",
				version: "1.0.0",
			},
			{ name: "@dsar/backend", private: true, version: "1.0.0" },
		]);
		const scripts = Object.fromEntries(
			prePublishScripts.map((script) => [
				script,
				script === failing ? "exit 1" : `bun steps.mjs ${script}`,
			])
		);
		write(
			root,
			"package.json",
			JSON.stringify({
				name: "fixture",
				private: true,
				scripts,
				workspaces: ["packages/*"],
			})
		);
		write(
			root,
			"steps.mjs",
			`import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
const step = process.argv[2];
if (step === 'build') {
 mkdirSync('packages/dsar/dist', { recursive: true });
 writeFileSync('packages/dsar/dist/index.js', 'export const built = true;');
}
appendFileSync('steps.log', step + '\\n');`
		);
		// A fake npm executable records uploads. No registry writes leave this test.
		write(
			root,
			"bin/npm",
			`#!${process.execPath}
const { appendFileSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const steps = readFileSync(resolve('../../steps.log'), 'utf8').trim().split('\\n');
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
appendFileSync(process.env.DSAR_PUBLISH_LOG, JSON.stringify({ args: process.argv.slice(2), name: manifest.name, provenance: process.env.NPM_CONFIG_PROVENANCE, steps, version: manifest.version }) + '\\n');
`
		);
		chmodSync(join(root, "bin/npm"), 0o755);
		write(root, ".npmrc", "registry=http://127.0.0.1:1\n");
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(new Response(null, { status: 404 })))
		);
		change(root, { dsar: "patch" });
		execFileSync("bun", ["install", "--ignore-scripts"], {
			cwd: root,
			stdio: "pipe",
		});
		return root;
	};

	const publishInIsolation = (root: string): void => {
		// tinyexec captures PATH at import time, so give it a fresh process. The
		// closed local registry is a second guard if executable resolution regresses.
		write(
			root,
			"publish-fixture.ts",
			`import { createRelease, runReleaseCli } from ${JSON.stringify(join(repository, "scripts/tegami.ts"))};
globalThis.fetch = async () => new Response(null, { status: 404 });
await runReleaseCli(createRelease({ branch: 'main', cwd: process.cwd(), github: false }), ['ci']);`
		);
		const env = {
			...process.env,
			DSAR_PUBLISH_LOG: join(root, "uploads.jsonl"),
			NPM_CONFIG_PROVENANCE: "true",
			NPM_CONFIG_REGISTRY: "http://127.0.0.1:1",
			PATH: `${join(root, "bin")}:${process.env.PATH}`,
		};
		execFileSync("bun", ["install", "--ignore-scripts"], {
			cwd: root,
			env,
			stdio: "pipe",
		});
		syncBunLockVersions(root, [
			{
				path: join(root, "packages/dsar"),
				version: readManifest(root, "dsar").version,
			},
		]);
		execFileSync("bun", ["publish-fixture.ts"], {
			cwd: root,
			env,
			stdio: "pipe",
			timeout: 30_000,
		});
	};

	it("runs the pre-publish steps, then publishes only dsar with the channel tag", async () => {
		const root = publishFixture();
		await applyDraft(release(root));

		publishInIsolation(root);

		const uploads = readFileSync(join(root, "uploads.jsonl"), "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as unknown);
		expect(uploads).toEqual([
			{
				args: [
					"publish",
					join(root, "packages/dsar/pkg.tgz"),
					"--tag",
					"latest",
				],
				name: "dsar",
				provenance: "true",
				steps: [...prePublishScripts],
				version: "1.0.1",
			},
		]);
		const packed = JSON.parse(
			execFileSync(
				"tar",
				["-xOf", join(root, "packages/dsar/pkg.tgz"), "package/package.json"],
				{ encoding: "utf8" }
			)
		) as Manifest;
		expect(JSON.stringify(packed)).not.toContain("workspace:");
	});

	it.each(prePublishScripts)("blocks uploads when %s fails", async (step) => {
		const root = publishFixture(step);
		await applyDraft(release(root));
		const lockPath = join(root, ".tegami/publish-lock.yaml");
		const lock = readFileSync(lockPath, "utf8");

		expect(() => publishInIsolation(root)).toThrow();

		expect(existsSync(join(root, "uploads.jsonl"))).toBe(false);
		expect(readFileSync(lockPath, "utf8")).toBe(lock);
	});

	it("dry runs validate without building or invoking npm", async () => {
		const root = publishFixture("build");
		await applyDraft(release(root));

		await release(root).publish({ dryRun: true });

		expect(existsSync(join(root, "packages/dsar/dist"))).toBe(false);
		expect(existsSync(join(root, "uploads.jsonl"))).toBe(false);
	});
});

it("drafts the real workspace without losing notes or bumping private packages", async () => {
	const root = fixture([]);
	cpSync(join(repository, ".tegami"), join(root, ".tegami"), {
		recursive: true,
	});
	const directories = [
		...readdirSync(join(repository, "packages")).map(
			(name) => `packages/${name}`
		),
		...readdirSync(join(repository, "packages/internals")).map(
			(name) => `packages/internals/${name}`
		),
	].filter((directory) =>
		existsSync(join(repository, directory, "package.json"))
	);
	const original = new Map<string, Manifest>();
	for (const directory of directories) {
		const content = readFileSync(
			join(repository, directory, "package.json"),
			"utf8"
		);
		original.set(directory, JSON.parse(content) as Manifest);
		write(root, `${directory}/package.json`, content);
	}
	write(
		root,
		"package.json",
		JSON.stringify({
			name: "fixture",
			private: true,
			workspaces: ["packages/*", "packages/internals/*"],
		})
	);

	const draft = await release(root).draft();
	const notes = readdirSync(join(root, ".tegami")).filter(
		(file) => file.endsWith(".md") && file !== "README.md"
	);
	// Tegami silently ignores malformed note files. Check that none were lost.
	expect(draft.getChangelogs()).toHaveLength(notes.length);
	await draft.apply();

	for (const [directory, manifest] of original) {
		const after = JSON.parse(
			readFileSync(join(root, directory, "package.json"), "utf8")
		) as Manifest;
		if (manifest.private) {
			expect(after.version).toBe(manifest.version);
		} else {
			expect(after.version).not.toBe(manifest.version);
		}
	}
	expect(await hasPending(release(root))).toBe(false);
});
