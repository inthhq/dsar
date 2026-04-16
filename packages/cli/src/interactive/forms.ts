import type { HttpMethod } from "../types";

/**
 * Supported input-control kinds for interactive CLI wizard fields.
 */
export type WizardFieldKind = "confirm" | "select" | "text";

/**
 * Field definition rendered by the interactive CLI wizard.
 */
export interface WizardField {
	/** Stable input key used to collect and map this field's value. */
	readonly key: string;
	/** Prompt label shown to the user in the interactive wizard. */
	readonly label: string;
	/** Input control type used to render this field. */
	readonly kind: WizardFieldKind;
	/** Indicates whether the user must provide a value. */
	readonly required: boolean;
	/** Placeholder text shown inside the input prompt. */
	readonly placeholder?: string;
	/** Default value used when the user omits input. */
	readonly defaultValue?: string;
	/** Selectable options for `"select"` fields. */
	readonly options?: readonly {
		readonly label: string;
		readonly value: string;
	}[];
	/** Transforms raw user input before it is stored. */
	readonly parse?: (value: string) => string;
}

/**
 * Interactive form definition for a CLI route command.
 */
export interface WizardCommandForm {
	/** Identifier linking this form or command to a route definition. */
	readonly routeId: string;
	/** Ordered field definitions rendered by the wizard. */
	readonly fields: readonly WizardField[];
	/** Converts collected wizard input into CLI flag arguments. */
	readonly toFlagMap: (
		input: Readonly<Partial<Record<string, string>>>
	) => Readonly<Record<string, string>>;
}

const trim = (value: string): string => value.trim();

const nonEmpty =
	(field: string) =>
	(value: string): string => {
		const trimmed = value.trim();
		if (trimmed.length === 0) {
			throw new Error(`${field} cannot be empty.`);
		}
		return trimmed;
	};

const jsonString =
	(field: string) =>
	(value: string): string => {
		const trimmed = value.trim();
		if (trimmed.length === 0) {
			throw new Error(`${field} cannot be empty.`);
		}
		JSON.parse(trimmed);
		return trimmed;
	};

const mapOptionalValue = (
	key: string,
	value: string | undefined
): Readonly<Record<string, string>> =>
	value && value.trim().length > 0 ? { [key]: value.trim() } : {};

const requiredValue = (
	input: Readonly<Partial<Record<string, string>>>,
	key: string
): string => {
	const raw = input?.[key] ?? "";
	const trimmed = raw.trim();
	if (trimmed.length === 0) {
		throw new Error(`Missing required wizard field '${key}'.`);
	}
	return trimmed;
};

const formRouteMap = new Map<string, WizardCommandForm>([
	[
		"requests_create",
		{
			fields: [
				{
					defaultValue: "cli",
					key: "channel",
					kind: "text",
					label: "Intake source channel",
					parse: nonEmpty("Channel"),
					required: true,
				},
				{
					key: "rawText",
					kind: "text",
					label: "Intake raw text",
					parse: nonEmpty("Raw text"),
					required: true,
				},
				{
					key: "contact",
					kind: "text",
					label: "Contact (optional)",
					parse: trim,
					required: false,
				},
				{
					key: "rawContextRef",
					kind: "text",
					label: "Raw context reference (optional)",
					parse: trim,
					required: false,
				},
			],
			routeId: "requests_create",
			toFlagMap: (input) => ({
				channel: requiredValue(input, "channel"),
				...mapOptionalValue("contact", input.contact),
				...mapOptionalValue("raw-context-ref", input.rawContextRef),
				"raw-text": requiredValue(input, "rawText"),
			}),
		},
	],
	[
		"requests_capture",
		{
			fields: [
				{
					defaultValue: "cli",
					key: "channel",
					kind: "text",
					label: "Intake source channel",
					parse: nonEmpty("Channel"),
					required: true,
				},
				{
					key: "rawText",
					kind: "text",
					label: "Intake raw text",
					parse: nonEmpty("Raw text"),
					required: true,
				},
			],
			routeId: "requests_capture",
			toFlagMap: (input) => ({
				channel: requiredValue(input, "channel"),
				"raw-text": requiredValue(input, "rawText"),
			}),
		},
	],
	[
		"requests_verification_request",
		{
			fields: [
				{
					defaultValue: "standard",
					key: "level",
					kind: "text",
					label: "Verification level",
					parse: nonEmpty("Verification level"),
					required: true,
				},
				{
					defaultValue: "document",
					key: "method",
					kind: "text",
					label: "Verification method",
					parse: nonEmpty("Verification method"),
					required: true,
				},
				{
					key: "reasonForDoubt",
					kind: "text",
					label: "Reason for doubt (optional)",
					parse: trim,
					required: false,
				},
			],
			routeId: "requests_verification_request",
			toFlagMap: (input) => ({
				json: JSON.stringify({
					level: requiredValue(input, "level"),
					method: requiredValue(input, "method"),
					reasonForDoubt:
						input.reasonForDoubt && input.reasonForDoubt.length > 0
							? input.reasonForDoubt
							: undefined,
				}),
			}),
		},
	],
	[
		"requests_verification_evidence",
		{
			fields: [
				{
					key: "jsonBody",
					kind: "text",
					label: "Verification evidence payload JSON",
					parse: jsonString("Verification evidence payload"),
					placeholder: '{"submittedAt":"...","evidence":[]}',
					required: true,
				},
			],
			routeId: "requests_verification_evidence",
			toFlagMap: (input) => ({
				json: requiredValue(input, "jsonBody"),
			}),
		},
	],
	[
		"requests_audit_verify",
		{
			fields: [
				{
					key: "jsonBody",
					kind: "text",
					label: "Audit verify payload JSON",
					parse: jsonString("Audit verify payload"),
					placeholder: '{"hash":"...","sequence":1}',
					required: true,
				},
			],
			routeId: "requests_audit_verify",
			toFlagMap: (input) => ({
				json: requiredValue(input, "jsonBody"),
			}),
		},
	],
	[
		"requests_audit_export",
		{
			fields: [
				{
					defaultValue: "jsonl",
					key: "format",
					kind: "select",
					label: "Audit export format",
					options: [
						{ label: "JSONL", value: "jsonl" },
						{ label: "CSV", value: "csv" },
					],
					parse: nonEmpty("Format"),
					required: true,
				},
			],
			routeId: "requests_audit_export",
			toFlagMap: (input) => ({
				format: requiredValue(input, "format"),
			}),
		},
	],
	[
		"tenants_retention_put",
		{
			fields: [
				{
					key: "jsonBody",
					kind: "text",
					label: "Retention policy JSON",
					parse: jsonString("Retention policy payload"),
					required: true,
				},
			],
			routeId: "tenants_retention_put",
			toFlagMap: (input) => ({
				json: requiredValue(input, "jsonBody"),
			}),
		},
	],
]);

const genericBodyRouteIds = new Set([
	"requests_delivery_prepare",
	"requests_delivery_address_verify",
	"requests_delivery_step_up_challenge",
	"requests_delivery_step_up_complete",
	"requests_fulfilment_callback",
	"requests_manifest_validate",
	"requests_appeals_create",
	"requests_appeals_decide",
	"policies_upgrades_propose",
	"policies_upgrades_approve",
	"policies_upgrades_apply",
	"requests_requestor_set",
	"requests_authority_submit",
	"requests_extensions_create",
	"requests_refusals_create",
]);

const genericJsonForm = (routeId: string): WizardCommandForm => ({
	fields: [
		{
			key: "jsonBody",
			kind: "text",
			label: "Request payload JSON",
			parse: jsonString("Request payload"),
			required: true,
		},
	],
	routeId,
	toFlagMap: (input) => ({
		json: requiredValue(input, "jsonBody"),
	}),
});

/**
 * Resolves the interactive wizard form for a route and HTTP method.
 *
 * @param routeId - Route identifier linked to a command definition.
 * @param method - HTTP method used by the route.
 * @returns Matching wizard form, or `undefined` when no form is available.
 */
export const getWizardForm = (
	routeId: string | undefined,
	method: HttpMethod
): WizardCommandForm | undefined => {
	if (!routeId) {
		return undefined;
	}
	const specific = formRouteMap.get(routeId);
	if (specific) {
		return specific;
	}
	if (
		(method === "POST" || method === "PUT") &&
		genericBodyRouteIds.has(routeId)
	) {
		return genericJsonForm(routeId);
	}
	return undefined;
};
