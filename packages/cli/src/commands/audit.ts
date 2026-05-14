import { makeRouteCommands } from "../commands/factory";

/**
 * CLI commands for audit-trail operations: exporting event chains
 * and verifying hash-chain integrity, plus tenant-wide list and export
 * for compliance review.
 */
export const auditCommands = makeRouteCommands([
	"requests_audit_export",
	"requests_audit_verify",
	"audit_list",
	"audit_export",
] as const);
