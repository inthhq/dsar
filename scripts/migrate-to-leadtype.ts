import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/**
 * One-shot migration to the leadtype docs contract.
 *
 * For every `.mdx` under `docs/` (excluding `_shared/`):
 *   1. Strip the hand-authored `lastModified:` frontmatter field.
 *   2. Insert `group: <slug>` derived from the file's directory.
 *   3. Replace `<import src=` with `<include src=` in the body.
 *
 * Pages whose path doesn't map to a leaf group (e.g. `docs/reference/index.mdx`)
 * are left ungrouped — they still render but are excluded from the nav tree
 * until the author rewrites them as a section landing.
 */

const workspaceRoot = process.cwd();
const docsDirectory = path.resolve(workspaceRoot, "docs");

const normalizeNewlines = (value: string): string =>
	value.replaceAll("\r\n", "\n");

const toPosixPath = (value: string): string => value.split(path.sep).join("/");

const collectMdxFiles = async (directory: string): Promise<string[]> => {
	const entries = await readdir(directory, { withFileTypes: true });
	const nestedPaths = await Promise.all(
		entries
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
			.map((entry) => collectMdxFiles(path.join(directory, entry.name)))
	);
	const localPaths = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
		.map((entry) => path.join(directory, entry.name));
	return [...localPaths, ...nestedPaths.flat()].toSorted();
};

/**
 * Leaf-group slugs keyed by `<top>` or `<top>/<second>` path prefix. Top-level
 * folders that are also leaf groups (guides, architecture) map directly; nested
 * folders (integrations/*, reference/*) map via the two-segment prefix.
 */
const LEAF_GROUP_BY_PATH_PREFIX: Record<string, string> = {
	architecture: "architecture",
	guides: "guides",
	"integrations/auth": "integrations-auth",
	"integrations/inbound": "integrations-inbound",
	"integrations/outbound": "integrations-outbound",
	"integrations/storage": "integrations-storage",
	"reference/api": "reference-api",
	"reference/developer": "reference-developer",
	"reference/errors": "reference-errors",
	"reference/persistence": "reference-persistence",
	"reference/storage": "reference-storage",
	"reference/testing": "reference-testing",
};

/**
 * Map a docs-relative POSIX path to a leaf group slug from `docs.config.ts`.
 * Returns `undefined` when the page belongs to a parent (non-leaf) group; the
 * migration leaves those pages ungrouped.
 */
const resolveGroup = (relativePosixPath: string): string | undefined => {
	const segments = relativePosixPath.split("/");
	if (segments.length === 1) {
		return;
	}
	const [top, second] = segments;
	const twoKey = second ? `${top}/${second}` : undefined;
	if (twoKey && twoKey in LEAF_GROUP_BY_PATH_PREFIX) {
		return LEAF_GROUP_BY_PATH_PREFIX[twoKey];
	}
	if (top && segments.length > 1 && top in LEAF_GROUP_BY_PATH_PREFIX) {
		return LEAF_GROUP_BY_PATH_PREFIX[top];
	}
};

interface Frontmatter {
	raw: string;
	lines: string[];
}

const splitFrontmatter = (
	source: string
): { frontmatter: Frontmatter | undefined; body: string } => {
	const normalized = normalizeNewlines(source);
	if (!normalized.startsWith("---\n")) {
		return { body: normalized, frontmatter: undefined };
	}
	const closingIndex = normalized.indexOf("\n---\n", 4);
	if (closingIndex === -1) {
		return { body: normalized, frontmatter: undefined };
	}
	const raw = normalized.slice(4, closingIndex);
	const body = normalized.slice(closingIndex + 5);
	return { body, frontmatter: { lines: raw.split("\n"), raw } };
};

const rebuildFrontmatter = (lines: string[]): string =>
	`---\n${lines.join("\n")}\n---\n`;

/**
 * Walk the `description:` key forward through any folded-scalar continuation
 * lines (lines that start with whitespace) to find the last index that still
 * belongs to the `description:` value.
 */
const findDescriptionTailIndex = (lines: string[]): number => {
	const descriptionIndex = lines.findIndex((line) =>
		line.startsWith("description:")
	);
	if (descriptionIndex === -1) {
		const titleIndex = lines.findIndex((line) => line.startsWith("title:"));
		return titleIndex === -1 ? -1 : titleIndex;
	}
	let index = descriptionIndex;
	while (index + 1 < lines.length && /^\s/.test(lines[index + 1] ?? "")) {
		index += 1;
	}
	return index;
};

/**
 * Return the frontmatter line list with `lastModified:` stripped and a `group:`
 * field inserted after `description:` (or `title:` if no description exists).
 */
const rewriteFrontmatterLines = (
	lines: string[],
	group: string | undefined
): string[] => {
	const filtered = lines.filter(
		(line) => !line.startsWith("lastModified:") && !line.startsWith("group:")
	);
	if (!group) {
		return filtered;
	}
	const insertAfter = findDescriptionTailIndex(filtered);
	filtered.splice(insertAfter + 1, 0, `group: ${group}`);
	return filtered;
};

type MigrationOutcome =
	| { kind: "skipped"; reason: string }
	| { kind: "unchanged" }
	| { kind: "updated"; group: string | undefined; content: string };

const computeMigration = (
	source: string,
	relativePosixPath: string
): MigrationOutcome => {
	const { frontmatter, body } = splitFrontmatter(source);
	if (!frontmatter) {
		return { kind: "skipped", reason: "no frontmatter" };
	}
	const group = resolveGroup(relativePosixPath);
	const newFrontmatter = rebuildFrontmatter(
		rewriteFrontmatterLines(frontmatter.lines, group)
	);
	const newContent =
		newFrontmatter + body.replaceAll("<import src=", "<include src=");
	if (newContent === source) {
		return { kind: "unchanged" };
	}
	return { content: newContent, group, kind: "updated" };
};

const migrateFile = async (filePath: string): Promise<void> => {
	const source = await readFile(filePath, "utf8");
	const relativePosixPath = toPosixPath(path.relative(docsDirectory, filePath));
	const outcome = computeMigration(source, relativePosixPath);
	if (outcome.kind === "skipped") {
		process.stderr.write(`skip (${outcome.reason}): ${filePath}\n`);
		return;
	}
	if (outcome.kind === "unchanged") {
		return;
	}
	await writeFile(filePath, outcome.content, "utf8");
	process.stdout.write(
		`updated ${relativePosixPath}${outcome.group ? ` (group: ${outcome.group})` : ""}\n`
	);
};

const main = async (): Promise<void> => {
	const files = await collectMdxFiles(docsDirectory);
	for (const file of files) {
		await migrateFile(file);
	}
};

await main();
