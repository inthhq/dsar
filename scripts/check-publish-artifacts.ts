/**
 * Installs the packed `dsar` tarball into an empty npm project and imports
 * every export, the way a consumer would.
 *
 * `dsar@0.0.5` shipped with `workspace:*` dependencies on unpublished
 * `@dsar/*` packages, so nobody could install it, and nothing in the build
 * noticed. This check runs before every publish and fails on:
 *
 * - a `workspace:` or `catalog:` specifier left in the packed manifest
 * - an export target missing from the tarball
 * - a React export that does not start with "use client"
 * - an export that loads without optional peers but whose declarations import
 *   one, which fails typechecking for consumers who never installed it
 * - an export that cannot be imported, unless the missing module is one of
 *   that package's optional peers (adapter subpaths need their own SDKs)
 * - a `dsar` binary that does not start
 *
 * Run `bun run build` first; the tarball is packed from `packages/dsar/dist`.
 */
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

interface ExportTarget {
	readonly import?: string;
	readonly types?: string;
}

interface PackageManifest {
	readonly bin?: Readonly<Record<string, string>>;
	/** Script entries map to import and types; assets map to a file path. */
	readonly exports?: Readonly<Record<string, ExportTarget | string>>;
	readonly name: string;
	readonly peerDependencies?: Readonly<Record<string, string>>;
	readonly peerDependenciesMeta?: Readonly<
		Record<string, { readonly optional?: boolean }>
	>;
	readonly version: string;
	readonly [field: string]: unknown;
}

const repository = path.resolve(import.meta.dirname, "..");
const packageDirectory = path.join(repository, "packages/dsar");
/**
 * Optional peers an export may name in its declarations even though its code
 * loads without them: the export exists for users of that peer.
 */
const declarationPeers: Readonly<Record<string, readonly string[]>> = {
	"./chat": ["chat"],
	"./node-sdk/webhooks/express": ["express"],
	"./node-sdk/webhooks/hono": ["hono"],
	"./node-sdk/webhooks/next": ["next"],
};

/** Exports whose module must be a React client module. */
const clientExports = ["./react"] as const;
const dependencyFields = [
	"dependencies",
	"optionalDependencies",
	"peerDependencies",
] as const;

const fail = (message: string): never => {
	throw new Error(`[check:publish-artifacts] ${message}`);
};

/**
 * Resolves Node and npm from the repository's toolchain. The scratch project
 * lives outside the repository, where a version manager may pick another Node.
 */
const resolveNodeBin = (): string =>
	path.dirname(
		execFileSync("node", ["-p", "process.execPath"], {
			cwd: repository,
			encoding: "utf8",
		}).trim()
	);

const packTarball = (destination: string): string => {
	execFileSync("bun", ["pm", "pack", "--destination", destination, "--quiet"], {
		cwd: packageDirectory,
		stdio: ["ignore", "ignore", "inherit"],
	});
	const tarball = readdirSync(destination).find((file) =>
		file.endsWith(".tgz")
	);
	return tarball
		? path.join(destination, tarball)
		: fail("bun pm pack produced no tarball.");
};

const readPackedManifest = (tarball: string): PackageManifest =>
	JSON.parse(
		execFileSync("tar", ["-xOzf", tarball, "package/package.json"], {
			encoding: "utf8",
		})
	) as PackageManifest;

const assertResolvedSpecifiers = (manifest: PackageManifest): void => {
	for (const field of dependencyFields) {
		const dependencies = manifest[field] as
			| Readonly<Record<string, string>>
			| undefined;
		for (const [name, range] of Object.entries(dependencies ?? {})) {
			if (/^(?:workspace|catalog):/u.test(range)) {
				fail(`${field}.${name} is still "${range}" in the packed manifest.`);
			}
			if (name.startsWith("@dsar/")) {
				fail(`${field}.${name} points at a private workspace package.`);
			}
		}
	}
};

const assertExportTargets = (
	manifest: PackageManifest,
	installed: string
): void => {
	for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
		const files =
			typeof target === "string" ? [target] : [target.import, target.types];
		for (const file of files) {
			if (file && !existsSync(path.join(installed, file))) {
				fail(`Export "${subpath}" points at ${file}, which is not packed.`);
			}
		}
	}
};

/**
 * Bundling drops module-level directives. A React export without a leading
 * "use client" fails in a Next.js server component tree.
 */
const assertClientExports = (
	manifest: PackageManifest,
	installed: string
): void => {
	for (const subpath of clientExports) {
		const target = manifest.exports?.[subpath];
		const file = typeof target === "string" ? target : target?.import;
		if (!file) {
			fail(`Client export "${subpath}" is missing.`);
		}
		const source = readFileSync(path.join(installed, file ?? ""), "utf8");
		if (!/^["']use client["'];?/u.test(source)) {
			fail(`Export "${subpath}" (${file}) does not start with "use client".`);
		}
	}
};

const bareImports = /(?:from|import)\s*\(?\s*["']([^"'.][^"']*)["']/gu;
const relativeImports = /(?:from|import)\s*\(?\s*["'](\.\.?\/[^"']+)["']/gu;

const packageNameOf = (specifier: string): string =>
	specifier.startsWith("@")
		? specifier.split("/").slice(0, 2).join("/")
		: (specifier.split("/")[0] ?? specifier);

/**
 * Lists the packages an export's declarations import, following relative
 * imports into shared declaration chunks.
 */
const declarationImports = (
	installed: string,
	typesFile: string
): ReadonlySet<string> => {
	const packages = new Set<string>();
	const seen = new Set<string>();
	const pending = [path.join(installed, typesFile)];
	for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
		if (seen.has(file)) {
			continue;
		}
		if (!existsSync(file)) {
			fail(
				`${path.relative(installed, file)} is imported by a declaration but is not packed.`
			);
		}
		seen.add(file);
		const source = readFileSync(file, "utf8");
		for (const [, specifier] of source.matchAll(bareImports)) {
			if (specifier && !specifier.startsWith("node:")) {
				packages.add(packageNameOf(specifier));
			}
		}
		for (const [, relative] of source.matchAll(relativeImports)) {
			if (relative) {
				// Declarations import sibling chunks by their JavaScript name.
				pending.push(
					path
						.resolve(path.dirname(file), relative)
						.replace(/\.mjs$/u, ".d.mts")
						.replace(/(?<!\.d)\.js$/u, ".d.ts")
				);
			}
		}
	}
	return packages;
};

const optionalPeers = (manifest: PackageManifest): ReadonlySet<string> =>
	new Set(
		Object.keys(manifest.peerDependencies ?? {}).filter(
			(name) => manifest.peerDependenciesMeta?.[name]?.optional === true
		)
	);

const specifierFor = (name: string, subpath: string): string =>
	subpath === "." ? name : `${name}/${subpath.slice(2)}`;

/**
 * Imports each export in a fresh Node process and reports, per specifier,
 * either success or the bare package a failed import could not find.
 */
const importExports = (
	project: string,
	specifiers: readonly string[],
	env: NodeJS.ProcessEnv
): ReadonlyMap<string, string | null> => {
	const probe = path.join(project, "probe.mjs");
	writeFileSync(
		probe,
		`const results = {};
for (const specifier of ${JSON.stringify(specifiers)}) {
	try {
		await import(specifier);
		results[specifier] = { ok: true };
	} catch (error) {
		results[specifier] = { code: error?.code, message: String(error?.message ?? error) };
	}
}
process.stdout.write(JSON.stringify(results));
`
	);
	const raw = JSON.parse(
		execFileSync("node", [probe], { cwd: project, encoding: "utf8", env })
	) as Record<
		string,
		{ readonly ok?: true; readonly code?: string; readonly message?: string }
	>;
	const missing = new Map<string, string | null>();
	for (const [specifier, result] of Object.entries(raw)) {
		if (result.ok) {
			missing.set(specifier, null);
			continue;
		}
		const match =
			result.code === "ERR_MODULE_NOT_FOUND"
				? /Cannot find package '([^']+)'/u.exec(result.message ?? "")
				: null;
		if (!match?.[1]) {
			fail(`import("${specifier}") failed: ${result.message}`);
		}
		missing.set(specifier, match?.[1] ?? null);
	}
	return missing;
};

const main = (): void => {
	if (!existsSync(path.join(packageDirectory, "dist"))) {
		fail("packages/dsar/dist is missing. Run `bun run build` first.");
	}
	const scratch = mkdtempSync(path.join(tmpdir(), "dsar-publish-check-"));
	try {
		const tarball = packTarball(scratch);
		const manifest = readPackedManifest(tarball);
		assertResolvedSpecifiers(manifest);

		const project = path.join(scratch, "consumer");
		execFileSync("mkdir", ["-p", project]);
		writeFileSync(
			path.join(project, "package.json"),
			JSON.stringify({ name: "dsar-consumer", private: true, type: "module" })
		);
		const nodeBin = resolveNodeBin();
		const env = { ...process.env, PATH: `${nodeBin}:${process.env.PATH}` };
		execFileSync(
			path.join(nodeBin, "npm"),
			["install", tarball, "--no-audit", "--no-fund", "--ignore-scripts"],
			{ cwd: project, env, stdio: ["ignore", "ignore", "inherit"] }
		);

		const installed = path.join(project, "node_modules", manifest.name);
		assertExportTargets(manifest, installed);
		assertClientExports(manifest, installed);

		const peers = optionalPeers(manifest);
		// Asset exports such as stylesheets are checked for presence above;
		// Node cannot import them.
		const specifiers = Object.entries(manifest.exports ?? {})
			.filter(([, target]) => typeof target !== "string")
			.map(([subpath]) => specifierFor(manifest.name, subpath));
		const skipped: string[] = [];
		for (const [specifier, missing] of importExports(
			project,
			specifiers,
			env
		)) {
			if (missing === null) {
				const subpath =
					specifier === manifest.name
						? "."
						: `./${specifier.slice(manifest.name.length + 1)}`;
				const target = manifest.exports?.[subpath];
				const typesFile =
					typeof target === "string" ? undefined : target?.types;
				for (const imported of typesFile
					? declarationImports(installed, typesFile)
					: []) {
					if (
						peers.has(imported) &&
						!declarationPeers[subpath]?.includes(imported)
					) {
						fail(
							`"${specifier}" loads without optional peers, but its declarations import "${imported}". Consumers without it cannot typecheck.`
						);
					}
				}
				continue;
			}
			const peer = packageNameOf(missing);
			if (!peers.has(peer)) {
				fail(
					`import("${specifier}") needs "${missing}", which is not a dependency or optional peer of ${manifest.name}.`
				);
			}
			skipped.push(`${specifier} (optional peer ${peer})`);
		}

		for (const bin of Object.keys(manifest.bin ?? {})) {
			execFileSync(path.join(project, "node_modules/.bin", bin), ["--help"], {
				cwd: project,
				env,
				stdio: "ignore",
			});
		}

		const imported = specifiers.length - skipped.length;
		console.log(
			`[check:publish-artifacts] ${manifest.name}@${manifest.version}: ${imported} of ${specifiers.length} exports imported from a clean install.`
		);
		for (const entry of skipped) {
			console.log(`[check:publish-artifacts]   skipped ${entry}`);
		}
	} finally {
		rmSync(scratch, { force: true, recursive: true });
	}
};

main();
