import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const workspaceRoot = process.cwd();
const docsDirectory = path.resolve(workspaceRoot, "docs");
const sharedWarningPath = path.resolve(
	workspaceRoot,
	"docs/_shared/alpha-warning.mdx"
);
const writeMode = process.argv.includes("--write");

const normalizeNewlines = (value: string): string =>
	value.replaceAll("\r\n", "\n");

const toPosixPath = (value: string): string => value.split(path.sep).join("/");

const collectMarkdownFiles = async (directory: string): Promise<string[]> => {
	const entries = await readdir(directory, { withFileTypes: true });
	const nestedPaths = await Promise.all(
		entries
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
			.map((entry) => collectMarkdownFiles(path.join(directory, entry.name)))
	);
	const localPaths = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
		.map((entry) => path.join(directory, entry.name));
	return [...localPaths, ...nestedPaths.flat()].toSorted();
};

const buildWarningImport = (filePath: string): string => {
	const relativePath = toPosixPath(
		path.relative(path.dirname(filePath), sharedWarningPath)
	);
	const importPath = relativePath.startsWith(".")
		? relativePath
		: `./${relativePath}`;
	return `<import src="${importPath}" />`;
};

const replaceWarningBlock = (
	content: string,
	warningImport: string
): string => {
	const normalized = normalizeNewlines(content);
	const warningPattern =
		/^(---\n[\s\S]*?\n---\n)(?:\n(?:(?:<import src="[^"\n]*alpha-warning\.mdx(?:#[^"\n]+)?"\s*\/>)|(?:<Callout\b[^>]*>[\s\S]*?<\/Callout>))\n?)?/u;
	const matched = normalized.match(warningPattern);
	if (!matched) {
		throw new Error(
			"Expected markdown document to start with an MDX frontmatter block."
		);
	}
	const [, frontmatter] = matched;
	const rest = normalized.slice(matched[0].length).replace(/^\n+/u, "");
	return `${frontmatter}\n${warningImport}\n\n${rest}`;
};

const relativeFromRoot = (absolutePath: string): string =>
	path.relative(workspaceRoot, absolutePath);

const markdownFiles = await collectMarkdownFiles(docsDirectory);

const mismatches: string[] = [];
let updatedCount = 0;

for (const filePath of markdownFiles) {
	const source = await readFile(filePath, "utf8");
	const warningImport = buildWarningImport(filePath);
	const next = replaceWarningBlock(source, warningImport);
	if (normalizeNewlines(source) === next) {
		continue;
	}

	if (!writeMode) {
		mismatches.push(relativeFromRoot(filePath));
		continue;
	}

	await writeFile(filePath, next);
	updatedCount += 1;
}

if (writeMode) {
	console.log(
		`[docs:sync-alpha-warning] Updated ${updatedCount} markdown doc${updatedCount === 1 ? "" : "s"}.`
	);
	process.exitCode = 0;
} else if (mismatches.length === 0) {
	console.log("[check:docs-alpha-warning] Docs alpha warning is in sync.");
	process.exitCode = 0;
} else {
	console.error(
		"[check:docs-alpha-warning] Docs missing the synced alpha warning:"
	);
	for (const filePath of mismatches) {
		console.error(`- ${filePath}`);
	}
	console.error(
		"Run `bun ./scripts/sync-docs-alpha-warning.ts --write` to update the docs."
	);
	process.exitCode = 1;
}
