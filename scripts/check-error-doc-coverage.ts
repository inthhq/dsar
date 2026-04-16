import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const docsDirectory = path.resolve(process.cwd(), "docs/errors");
const packagesDirectory = path.resolve(process.cwd(), "packages");

const readDocSlugs = async (): Promise<string[]> => {
	const files = await readdir(docsDirectory, { withFileTypes: true });
	return files
		.filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
		.map((entry) => entry.name.replace(/\.mdx$/u, ""));
};

const isErrorCatalogFile = (filePath: string, fileName: string): boolean =>
	fileName === "error-codes.ts" &&
	filePath.includes(`${path.sep}src${path.sep}types${path.sep}`);

const collectErrorCatalogFiles = async (
	directory: string
): Promise<string[]> => {
	const entries = await readdir(directory, { withFileTypes: true });
	const nestedFiles = await Promise.all(
		entries
			.filter((entry) => entry.isDirectory())
			.map((entry) =>
				collectErrorCatalogFiles(path.join(directory, entry.name))
			)
	);
	const localFiles = entries
		.filter((entry) => entry.isFile())
		.map((entry) => path.join(directory, entry.name))
		.filter((entryPath) =>
			isErrorCatalogFile(entryPath, path.basename(entryPath))
		);
	return [...localFiles, ...nestedFiles.flat()];
};

const collectExportedErrorIds = (
	moduleExports: Record<string, unknown>
): string[] =>
	Object.entries(moduleExports)
		.filter(
			([exportName, value]) =>
				exportName.endsWith("_ERROR_IDS") && Array.isArray(value)
		)
		.flatMap(([, value]) =>
			(value as unknown[]).filter((id): id is string => typeof id === "string")
		);

const ingestIds = (
	ids: string[],
	seenIds: Set<string>,
	duplicateIds: Set<string>,
	moduleIds: string[]
): void => {
	for (const id of moduleIds) {
		if (seenIds.has(id)) {
			duplicateIds.add(id);
		}
		seenIds.add(id);
		ids.push(id);
	}
};

const readErrorIdsFromCatalogFile = async (
	filePath: string
): Promise<string[]> => {
	const moduleUrl = pathToFileURL(filePath).href;
	const moduleExports = (await import(moduleUrl)) as Record<string, unknown>;
	return collectExportedErrorIds(moduleExports);
};

const readAllErrorIds = async (): Promise<{
	readonly duplicateIds: string[];
	readonly ids: string[];
}> => {
	const catalogFiles = await collectErrorCatalogFiles(packagesDirectory);
	const ids: string[] = [];
	const duplicateIds = new Set<string>();
	const seenIds = new Set<string>();
	for (const filePath of catalogFiles) {
		const moduleIds = await readErrorIdsFromCatalogFile(filePath);
		ingestIds(ids, seenIds, duplicateIds, moduleIds);
	}
	return { duplicateIds: [...duplicateIds], ids };
};

const { duplicateIds, ids } = await readAllErrorIds();
const expectedDocSlugs = ids.map((id) => id.toLowerCase());
const actualDocSlugs = await readDocSlugs();

const missingDocs = expectedDocSlugs.filter(
	(slug) => !actualDocSlugs.includes(slug)
);
const orphanDocs = actualDocSlugs.filter(
	(slug) => !expectedDocSlugs.includes(slug)
);

if (
	missingDocs.length === 0 &&
	orphanDocs.length === 0 &&
	duplicateIds.length === 0
) {
	console.log("[check:error-docs] Error docs are in sync with catalog.");
	process.exitCode = 0;
} else {
	if (missingDocs.length > 0) {
		console.error("[check:error-docs] Missing docs:");
		for (const slug of missingDocs) {
			console.error(`- docs/errors/${slug}.mdx`);
		}
	}

	if (orphanDocs.length > 0) {
		console.error("[check:error-docs] Orphan docs not in catalog:");
		for (const slug of orphanDocs) {
			console.error(`- docs/errors/${slug}.mdx`);
		}
	}

	if (duplicateIds.length > 0) {
		console.error("[check:error-docs] Duplicate error IDs across packages:");
		for (const id of duplicateIds) {
			console.error(`- ${id}`);
		}
	}

	process.exitCode = 1;
}
