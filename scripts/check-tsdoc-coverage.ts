/* oxlint-disable max-statements, prefer-destructuring */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import * as ts from "@typescript/typescript6";

interface Failure {
	filePath: string;
	line: number;
	message: string;
	symbol: string;
}

interface FunctionLikeMeta {
	parameterNames: string[];
	requiresReturns: boolean;
	symbolName: string;
	typeParameterNames: string[];
}

interface CheckDeclarationInput {
	absoluteFilePath: string;
	declarationNode: ts.Declaration;
	docNode: ts.Node;
	sourceFile: ts.SourceFile;
	symbolName: string;
}

type JSDocNode = ts.Node & { jsDoc?: ts.JSDoc[] };
type JSDocComment = string | ts.NodeArray<ts.JSDocComment> | undefined;

const workspaceRoot = process.cwd();
const packageRoots = [
	path.resolve(workspaceRoot, "packages"),
	path.resolve(workspaceRoot, "packages/internals"),
];

const skipDirectoryNames = new Set([
	"__fixtures__",
	"__tests__",
	"coverage",
	"dist",
	"generated",
	"test",
	"tests",
]);

const skipFilePattern = /\.(spec|test)\.(ts|tsx)$/u;

const flatten = <T>(values: T[][]): T[] => values.flat();

const commentText = (comment: JSDocComment): string => {
	if (typeof comment === "string") {
		return comment.trim();
	}
	if (!comment) {
		return "";
	}
	if (Array.isArray(comment)) {
		return (comment as ts.JSDocComment[])
			.map((part) => (typeof part === "string" ? part : part.text))
			.join("")
			.trim();
	}
	return "";
};

const getJsDocs = (node: ts.Node): ts.JSDoc[] =>
	(node as JSDocNode).jsDoc ?? [];

const hasSummary = (node: ts.Node): boolean =>
	getJsDocs(node).some((doc) => commentText(doc.comment).length > 0);

const getTags = (node: ts.Node): ts.JSDocTag[] =>
	flatten(getJsDocs(node).map((doc) => (doc.tags ? [...doc.tags] : [])));

const tagName = (tag: ts.JSDocTag): string => {
	if (!tag.tagName) {
		return "";
	}
	return String(tag.tagName.escapedText ?? "");
};

const getParamTags = (
	node: ts.Node,
	sourceFile: ts.SourceFile
): Set<string> => {
	const names = new Set<string>();
	for (const tag of getTags(node)) {
		if (tagName(tag) !== "param") {
			continue;
		}
		if ("name" in tag && (tag as ts.JSDocParameterTag).name) {
			names.add((tag as ts.JSDocParameterTag).name.getText(sourceFile));
		}
	}
	return names;
};

const parseTypeParamName = (
	tag: ts.JSDocTag,
	sourceFile: ts.SourceFile
): string | undefined => {
	if ("name" in tag && (tag as ts.JSDocTemplateTag).name) {
		const templateTag = tag as ts.JSDocTemplateTag;
		return String(
			(templateTag.name as ts.Identifier).escapedText ??
				templateTag.name.getText(sourceFile)
		);
	}
	if (
		"typeParameters" in tag &&
		(tag as ts.JSDocTemplateTag).typeParameters?.length
	) {
		const first = (tag as ts.JSDocTemplateTag).typeParameters?.[0];
		if (!first) {
			return undefined;
		}
		return String(first.name.escapedText ?? first.name.getText(sourceFile));
	}
	const raw = tag.getText(sourceFile);
	const matched = raw.match(/^@typeParam\s+([A-Za-z_$][A-Za-z0-9_$]*)/u);
	return matched?.[1];
};

const getTypeParamTags = (
	node: ts.Node,
	sourceFile: ts.SourceFile
): Set<string> => {
	const names = new Set<string>();
	for (const tag of getTags(node)) {
		const name = tagName(tag);
		if (name !== "typeParam") {
			continue;
		}
		const parsedName = parseTypeParamName(tag, sourceFile);
		if (parsedName) {
			names.add(parsedName);
		}
	}
	return names;
};

const hasReturnsTag = (node: ts.Node): boolean =>
	getTags(node).some((tag) => {
		const name = tagName(tag);
		return name === "returns";
	});

const isExported = (node: ts.Statement): boolean =>
	Boolean(
		node.modifiers?.some(
			(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
		)
	);

const collectLocalExportNames = (sourceFile: ts.SourceFile): Set<string> => {
	const names = new Set<string>();
	for (const statement of sourceFile.statements) {
		if (
			ts.isExportDeclaration(statement) &&
			!statement.moduleSpecifier &&
			statement.exportClause &&
			ts.isNamedExports(statement.exportClause)
		) {
			for (const element of statement.exportClause.elements) {
				names.add(element.propertyName?.text ?? element.name.text);
			}
		}
		if (
			ts.isExportAssignment(statement) &&
			ts.isIdentifier(statement.expression)
		) {
			names.add(statement.expression.text);
		}
	}
	return names;
};

const getLine = (sourceFile: ts.SourceFile, node: ts.Node): number =>
	sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

const getNodeName = (node: ts.Node, fallback: string): string => {
	if ("name" in node) {
		const name = (node as ts.NamedDeclaration).name;
		if (!name) {
			return fallback;
		}
		if (ts.isIdentifier(name)) {
			return name.text;
		}
		return name.getText();
	}
	return fallback;
};

type FunctionLikeNode =
	| ts.FunctionDeclaration
	| ts.ArrowFunction
	| ts.FunctionExpression;

const hasNonVoidReturn = (node: ts.Node): boolean => {
	if (ts.isReturnStatement(node)) {
		return node.expression !== undefined;
	}
	if (
		ts.isFunctionDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isArrowFunction(node)
	) {
		return false;
	}
	return ts.forEachChild(node, hasNonVoidReturn) ?? false;
};

const isVoidReturn = (
	functionLike: FunctionLikeNode,
	sourceFile: ts.SourceFile
): boolean => {
	const returnType = functionLike.type
		?.getText(sourceFile)
		?.replaceAll(/\s+/gu, "");
	if (returnType) {
		return (
			returnType === "void" ||
			returnType === "Promise<void>" ||
			returnType === "PromiseLike<void>"
		);
	}
	if (!functionLike.body) {
		return true;
	}
	if (ts.isBlock(functionLike.body)) {
		return !hasNonVoidReturn(functionLike.body);
	}
	return false;
};

const collectFunctionLikeMeta = (
	declaration: ts.Declaration,
	sourceFile: ts.SourceFile
): FunctionLikeMeta | null => {
	let functionLike: FunctionLikeNode | null = null;
	let symbolName = getNodeName(declaration, "anonymousExport");

	if (ts.isFunctionDeclaration(declaration)) {
		functionLike = declaration;
	} else if (ts.isVariableDeclaration(declaration)) {
		symbolName = getNodeName(declaration, "anonymousExport");
		if (
			declaration.initializer &&
			(ts.isArrowFunction(declaration.initializer) ||
				ts.isFunctionExpression(declaration.initializer))
		) {
			functionLike = declaration.initializer;
		}
	}

	if (!functionLike) {
		return null;
	}

	const parameterNames: string[] = [];
	for (const parameter of functionLike.parameters) {
		const paramName = parameter.name;
		if (ts.isIdentifier(paramName)) {
			if (paramName.text !== "this") {
				parameterNames.push(paramName.text);
			}
		} else if (ts.isObjectBindingPattern(paramName)) {
			parameterNames.push(paramName.getText(sourceFile));
		} else if (ts.isArrayBindingPattern(paramName)) {
			parameterNames.push(paramName.getText(sourceFile));
		}
	}

	const typeParameterNames = (functionLike.typeParameters ?? []).map(
		(typeParameter) => typeParameter.name.text
	);

	return {
		parameterNames,
		requiresReturns: !isVoidReturn(functionLike, sourceFile),
		symbolName,
		typeParameterNames,
	};
};

const collectTypeParameterNames = (node: ts.Declaration): string[] =>
	((node as ts.DeclarationWithTypeParameters).typeParameters ?? []).map(
		(typeParameter) => typeParameter.name.text
	);

const shouldSkipFile = (absoluteFilePath: string): boolean => {
	if (skipFilePattern.test(absoluteFilePath)) {
		return true;
	}
	return false;
};

const collectTsFiles = async (directory: string): Promise<string[]> => {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (skipDirectoryNames.has(entry.name)) {
				continue;
			}
			files.push(...(await collectTsFiles(fullPath)));
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) {
			continue;
		}
		if (shouldSkipFile(fullPath)) {
			continue;
		}
		files.push(fullPath);
	}
	return files;
};

const readPackageDirs = async (rootDirectory: string): Promise<string[]> => {
	const packageDirs: string[] = [];
	const entries = await readdir(rootDirectory, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}
		const packageDirectory = path.join(rootDirectory, entry.name);
		const srcDirectory = path.join(packageDirectory, "src");
		const packageJson = path.join(packageDirectory, "package.json");
		try {
			await readFile(packageJson, "utf-8");
			await readdir(srcDirectory);
			packageDirs.push(packageDirectory);
		} catch {
			// Ignore non-package directories.
		}
	}
	return packageDirs;
};

const failures: Failure[] = [];

const pushFailure = (
	absoluteFilePath: string,
	line: number,
	symbol: string,
	message: string
): void => {
	failures.push({
		filePath: path.relative(workspaceRoot, absoluteFilePath),
		line,
		message,
		symbol,
	});
};

const checkDeclarationDocs = (input: CheckDeclarationInput): void => {
	const { absoluteFilePath, declarationNode, docNode, sourceFile, symbolName } =
		input;
	if (!hasSummary(docNode)) {
		pushFailure(
			absoluteFilePath,
			getLine(sourceFile, declarationNode),
			symbolName,
			"missing TSDoc summary"
		);
	}

	if (!ts.isFunctionDeclaration(declarationNode)) {
		const typeParameterNames = collectTypeParameterNames(declarationNode);
		if (typeParameterNames.length > 0) {
			const typeParamTags = getTypeParamTags(docNode, sourceFile);
			for (const typeParameterName of typeParameterNames) {
				if (!typeParamTags.has(typeParameterName)) {
					pushFailure(
						absoluteFilePath,
						getLine(sourceFile, declarationNode),
						symbolName,
						`missing @typeParam for \`${typeParameterName}\``
					);
				}
			}
		}
	}
};

const checkInterfaceProperties = (
	absoluteFilePath: string,
	sourceFile: ts.SourceFile,
	interfaceNode: ts.InterfaceDeclaration,
	interfaceName: string
): void => {
	for (const member of interfaceNode.members) {
		if (!ts.isPropertySignature(member)) {
			continue;
		}
		if (hasSummary(member)) {
			continue;
		}
		const propertyName = member.name.getText(sourceFile);
		pushFailure(
			absoluteFilePath,
			getLine(sourceFile, member),
			`${interfaceName}.${propertyName}`,
			"missing interface property comment"
		);
	}
};

const checkFunctionLikeDocs = (
	absoluteFilePath: string,
	sourceFile: ts.SourceFile,
	declarationNode: ts.Declaration,
	docNode: ts.Node,
	lineNode: ts.Node,
	symbolName: string
): void => {
	const functionMeta = collectFunctionLikeMeta(declarationNode, sourceFile);
	if (!functionMeta) {
		return;
	}

	const paramTags = getParamTags(docNode, sourceFile);
	for (const parameterName of functionMeta.parameterNames) {
		if (!paramTags.has(parameterName)) {
			pushFailure(
				absoluteFilePath,
				getLine(sourceFile, lineNode),
				symbolName,
				`missing @param for \`${parameterName}\``
			);
		}
	}

	const typeParamTags = getTypeParamTags(docNode, sourceFile);
	for (const typeParameterName of functionMeta.typeParameterNames) {
		if (!typeParamTags.has(typeParameterName)) {
			pushFailure(
				absoluteFilePath,
				getLine(sourceFile, lineNode),
				symbolName,
				`missing @typeParam for \`${typeParameterName}\``
			);
		}
	}

	if (functionMeta.requiresReturns && !hasReturnsTag(docNode)) {
		pushFailure(
			absoluteFilePath,
			getLine(sourceFile, lineNode),
			symbolName,
			"missing @returns for non-void function"
		);
	}
};

const checkFile = async (absoluteFilePath: string): Promise<void> => {
	const content = await readFile(absoluteFilePath, "utf-8");
	const scriptKind = absoluteFilePath.endsWith(".tsx")
		? ts.ScriptKind.TSX
		: ts.ScriptKind.TS;
	const sourceFile = ts.createSourceFile(
		absoluteFilePath,
		content,
		ts.ScriptTarget.Latest,
		true,
		scriptKind
	);

	const reExportedNames = collectLocalExportNames(sourceFile);

	for (const statement of sourceFile.statements) {
		if (ts.isExportDeclaration(statement)) {
			continue;
		}

		const inlineExported = isExported(statement);

		if (
			ts.isFunctionDeclaration(statement) ||
			ts.isClassDeclaration(statement) ||
			ts.isInterfaceDeclaration(statement) ||
			ts.isTypeAliasDeclaration(statement) ||
			ts.isEnumDeclaration(statement)
		) {
			const symbolName = getNodeName(statement, "anonymousExport");
			if (!inlineExported && !reExportedNames.has(symbolName)) {
				continue;
			}
			checkDeclarationDocs({
				absoluteFilePath,
				declarationNode: statement,
				docNode: statement,
				sourceFile,
				symbolName,
			});

			if (ts.isInterfaceDeclaration(statement)) {
				checkInterfaceProperties(
					absoluteFilePath,
					sourceFile,
					statement,
					symbolName
				);
			}

			if (ts.isFunctionDeclaration(statement)) {
				checkFunctionLikeDocs(
					absoluteFilePath,
					sourceFile,
					statement,
					statement,
					statement,
					symbolName
				);
			}
			continue;
		}

		if (!ts.isVariableStatement(statement)) {
			continue;
		}

		for (const declaration of statement.declarationList.declarations) {
			const symbolName = getNodeName(declaration, "anonymousExport");
			if (!inlineExported && !reExportedNames.has(symbolName)) {
				continue;
			}
			checkDeclarationDocs({
				absoluteFilePath,
				declarationNode: declaration,
				docNode: statement,
				sourceFile,
				symbolName,
			});
			checkFunctionLikeDocs(
				absoluteFilePath,
				sourceFile,
				declaration,
				statement,
				declaration,
				symbolName
			);
		}
	}
};

const packageDirectories = flatten(
	await Promise.all(
		packageRoots.map((rootDirectory) => readPackageDirs(rootDirectory))
	)
);

const sourceFiles = flatten(
	await Promise.all(
		packageDirectories.map((packageDirectory) =>
			collectTsFiles(path.join(packageDirectory, "src"))
		)
	)
);

for (const sourceFilePath of sourceFiles) {
	await checkFile(sourceFilePath);
}

if (failures.length === 0) {
	console.log("[check:tsdoc] Exported API documentation coverage passed.");
	process.exitCode = 0;
} else {
	console.error("[check:tsdoc] Missing TSDoc coverage:");
	for (const failure of failures) {
		console.error(
			`- ${failure.filePath}:${failure.line} [${failure.symbol}] ${failure.message}`
		);
	}
	process.exitCode = 1;
}
