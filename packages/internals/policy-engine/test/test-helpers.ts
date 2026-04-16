import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { EvaluatorInput } from "../src";

export interface FixtureFile {
	readonly name: string;
	readonly input: EvaluatorInput;
}

export const readFixture = (fileName: string): FixtureFile => {
	const fixturePath = resolve(import.meta.dirname, "fixtures", fileName);
	const raw: unknown = JSON.parse(readFileSync(fixturePath, "utf8"));
	return raw as FixtureFile;
};
