import { makeRouteCommands } from "../commands/factory";

/**
 * CLI commands for audit-trail operations: exporting event chains
 * and verifying hash-chain integrity.
 */
export const auditCommands = makeRouteCommands([
	"requests_audit_export",
	"requests_audit_verify",
] as const);
