for (const s of [
	"dsar",
	"dsar/backend",
	"dsar/node-sdk",
	"dsar/node-sdk/webhooks",
	"dsar/cli",
	"dsar/redis",
	"dsar/upstash",
	"dsar/storage-filesystem",
	"dsar/core",
]) {
	try {
		const m = await import(s);
		console.log("ok", s, Object.keys(m).length);
	} catch (error) {
		console.log("FAIL", s, error.message.split("\n")[0]);
	}
}
