#!/usr/bin/env node
import { runCli } from "./runtime";

const main = async () => {
	const exitCode = await runCli({
		argv: process.argv.slice(2),
		env: process.env,
	});
	process.exitCode = exitCode;
};

try {
	await main();
} catch (error) {
	const message =
		error instanceof Error ? error.message : "Unhandled CLI bootstrap failure.";
	console.error(message);
	process.exitCode = 1;
}
