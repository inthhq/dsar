import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import {
	applyEdits,
	findNodeAtLocation,
	modify,
	parseTree,
} from "jsonc-parser";
import { prerelease, valid } from "semver";
import { tegami } from "tegami";
import type {
	PublishPlan,
	Tegami,
	TegamiPlugin,
	WorkspacePackage,
} from "tegami";
import { createCli } from "tegami/cli";
import { github } from "tegami/plugins/github";
import { NpmPackage } from "tegami/providers/npm";

/** npm dist-tag and prerelease identifier for each release branch. */
const distTags: Readonly<Record<string, string>> = {
	canary: "canary",
	main: "latest",
};

/** Resolve a supported branch to an explicit npm tag and prerelease identifier. */
export const releaseLine = (
	branch: string,
	commit?: string
): { readonly distTag: string; readonly prerelease: string | undefined } => {
	switch (branch) {
		case "main": {
			return { distTag: "latest", prerelease: undefined };
		}
		case "canary": {
			if (!(commit && /^[a-f\d]{40}$/u.test(commit))) {
				throw new Error("Canary releases require a full Git commit SHA.");
			}
			return { distTag: "canary", prerelease: `canary-${commit}` };
		}
		default: {
			throw new Error(
				`Unsupported release branch: ${branch}. Set RELEASE_BRANCH to the PR target when running Tegami locally.`
			);
		}
	}
};

/** Reject versions that would escape the selected release channel. */
export const checkReleaseVersion = (branch: string, version: string): void => {
	const channels: Readonly<Record<string, boolean>> = {
		canary: /^\d+\.\d+\.\d+-canary-[a-f\d]{40}\.\d+$/u.test(version),
		main: prerelease(version) === null,
	};
	if (!(valid(version) && channels[branch])) {
		throw new Error(`${version} is not a valid release for ${branch}.`);
	}
};

interface ReleaseRecord {
	readonly branch: string;
	readonly id: string;
	readonly version: string;
}

const isReleaseRecord = (entry: unknown): entry is ReleaseRecord =>
	typeof entry === "object" &&
	entry !== null &&
	"branch" in entry &&
	typeof entry.branch === "string" &&
	"id" in entry &&
	typeof entry.id === "string" &&
	"version" in entry &&
	typeof entry.version === "string";

/**
 * Root scripts that run, in order, before any package is uploaded. A failure
 * stops the release with the publish lock intact, so a retry starts here.
 */
export const prePublishScripts = [
	"build",
	"release:docs",
	"check:publish-artifacts",
] as const;

const releaseChecks = (branch: string, distTag: string): TegamiPlugin => {
	const planBranches = new WeakMap<PublishPlan, string>();
	return {
		beforePublishAll({ plan }) {
			if (planBranches.get(plan) !== branch) {
				throw new Error(
					`Publish lock does not belong to ${branch}. Publish it on its original branch first.`
				);
			}
			for (const pkgPlan of plan.packages.values()) {
				if (
					pkgPlan.updated &&
					(pkgPlan.npm?.distTag !== distTag || pkgPlan.npm.markLatest)
				) {
					throw new Error(`Publish lock npm tag does not match ${distTag}.`);
				}
			}
			if (plan.options.dryRun || plan.getPackagesToPublish().length === 0) {
				return;
			}
			for (const script of prePublishScripts) {
				execFileSync("bun", ["run", script], {
					cwd: this.cwd,
					stdio: "inherit",
				});
			}
		},
		enforce: "post",
		initPublishLock({ lock, draft }) {
			for (const pkg of this.graph.getPackages()) {
				if (!(pkg.version && draft.getPackageDraft(pkg.id))) {
					continue;
				}
				checkReleaseVersion(branch, pkg.version);
				lock.write("dsar:release", {
					branch,
					id: pkg.id,
					version: pkg.version,
				});
			}
		},
		initPublishPlan({ lock, plan }) {
			const versions = new Map<string, string>();
			let lockBranch: string | undefined;
			let entry: unknown = lock.read("dsar:release");
			while (entry) {
				if (
					!isReleaseRecord(entry) ||
					(lockBranch !== undefined && entry.branch !== lockBranch)
				) {
					throw new Error("Publish lock has invalid release metadata.");
				}
				lockBranch = entry.branch;
				versions.set(entry.id, entry.version);
				entry = lock.read("dsar:release");
			}
			if (lockBranch) {
				planBranches.set(plan, lockBranch);
			}
			for (const [id, pkgPlan] of plan.packages) {
				if (!pkgPlan.updated) {
					continue;
				}
				const pkg = this.graph.get(id);
				if (!pkg?.version || versions.get(id) !== pkg.version) {
					throw new Error(`Publish lock version does not match ${id}.`);
				}
				checkReleaseVersion(lockBranch ?? "", pkg.version);
				if (
					!pkgPlan.npm ||
					pkgPlan.npm.distTag !== distTags[lockBranch ?? ""] ||
					pkgPlan.npm.markLatest
				) {
					throw new Error(
						"Publish lock npm tag does not match its release branch."
					);
				}
			}
		},
		name: "dsar-release-checks",
		resolve() {
			// The @dsar/* workspaces are bundled into `dsar` and never published.
			for (const pkg of this.graph.getPackages()) {
				if (pkg instanceof NpmPackage && pkg.manifest.private) {
					this.graph.delete(pkg.id);
				}
			}
		},
	};
};

/**
 * Bun leaves workspace versions in `bun.lock` stale after a version-only
 * manifest edit, even with `bun install --lockfile-only`.
 */
export const syncBunLockVersions = (
	cwd: string,
	packages: readonly Pick<WorkspacePackage, "path" | "version">[]
): void => {
	const path = join(cwd, "bun.lock");
	const original = readFileSync(path, "utf8");
	let content = original;
	for (const pkg of packages) {
		if (!pkg.version) {
			continue;
		}
		const location = [
			"workspaces",
			relative(cwd, pkg.path).replaceAll("\\", "/"),
		];
		const tree = parseTree(content);
		if (!(tree && findNodeAtLocation(tree, location))) {
			throw new Error(`Workspace ${pkg.path} is missing from bun.lock.`);
		}
		content = applyEdits(
			content,
			modify(content, [...location, "version"], pkg.version, {})
		);
	}
	if (content !== original) {
		writeFileSync(path, content);
	}
};

interface ReleaseOptions {
	readonly branch: string;
	readonly commit?: string;
	readonly cwd?: string;
	readonly github?: boolean;
}

/** Create the release workflow. Drafts can be tested without GitHub or publishing. */
export const createRelease = ({
	branch,
	commit,
	cwd = process.cwd(),
	github: withGithub = true,
}: ReleaseOptions): Tegami => {
	const line = releaseLine(branch, commit);
	return tegami({
		cwd,
		npm: {
			bumpDep: ({ kind, dependent }) => {
				if (dependent.manifest.private || kind === "devDependencies") {
					return false;
				}
				return kind === "peerDependencies" ? "major" : "patch";
			},
			client: "bun",
			updateLockFile: true,
		},
		packages: () => ({
			npm: { distTag: line.distTag },
			prerelease: line.prerelease,
		}),
		plugins: [
			{
				initDraft(draft) {
					// Every canary push publishes a snapshot, with or without notes.
					if (branch === "canary") {
						for (const pkg of this.graph.getPackages()) {
							draft.bumpPackage(pkg, { type: "patch" });
						}
					}
				},
				name: "dsar-canary-snapshots",
			},
			releaseChecks(branch, line.distTag),
			{
				applyCliDraft() {
					syncBunLockVersions(this.cwd, this.graph.getPackages());
					// Tegami also rewrites private workspace manifests, which are not in
					// the graph, with two-space indentation. Format every manifest.
					const manifests = execFileSync(
						"git",
						["ls-files", "--", "package.json", "**/package.json"],
						{ cwd: this.cwd, encoding: "utf8" }
					)
						.split("\n")
						.filter(Boolean);
					execFileSync("bun", ["x", "oxfmt", ".tegami", ...manifests], {
						cwd: this.cwd,
						stdio: "inherit",
					});
				},
				name: "dsar-format-release",
			},
			...(withGithub
				? github({
						repo: "inthhq/dsar",
						versionPr:
							branch === "canary"
								? false
								: {
										base: branch,
										branch: `tegami/version-packages-${branch}`,
									},
					})
				: []),
		],
	});
};

/** Finish an existing release before CI can replace its publish lock. */
export const runReleaseCli = async (
	release: Tegami,
	args: readonly string[] = process.argv.slice(2)
): Promise<void> => {
	const command = [...args];
	if (command[0] === "ci") {
		const { status } = await release.getPublishStatus();
		if (status === "pending") {
			command[0] = "publish";
		}
	}
	await createCli(release).parseAsync(command);
};

if (import.meta.main) {
	const branch =
		process.env.GITHUB_BASE_REF ||
		process.env.GITHUB_REF_NAME ||
		process.env.RELEASE_BRANCH ||
		execFileSync("git", ["branch", "--show-current"], {
			encoding: "utf8",
		}).trim();
	const commit = execFileSync("git", ["rev-parse", "HEAD"], {
		encoding: "utf8",
	}).trim();
	await runReleaseCli(createRelease({ branch, commit }));
}
