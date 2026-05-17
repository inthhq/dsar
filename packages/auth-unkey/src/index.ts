import { Unkey } from "@unkey/api";

import type {
	DsarPrincipalKind,
	DsarResolvedIdentity,
	UnkeyBearerResolverClient,
	UnkeyBearerResolverConfig,
	UnkeyVerifyResultShape,
} from "./types";

const DEFAULT_METADATA_KEYS = {
	email: "email",
	principalKind: "principalKind",
	role: "role",
	tenantId: "tenantId",
	workspaceId: "workspaceId",
} as const;

interface MetadataKeys {
	readonly email: string;
	readonly principalKind: string;
	readonly role: string;
	readonly tenantId: string;
	readonly workspaceId: string;
}

const asRecord = (
	value: unknown
): Readonly<Record<string, unknown>> | undefined =>
	value !== null && typeof value === "object"
		? (value as Readonly<Record<string, unknown>>)
		: undefined;

const readString = (
	record: Readonly<Record<string, unknown>> | undefined,
	key: string
): string | undefined => {
	const value = record?.[key];
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
};

const readFirstString = (value: unknown): string | undefined => {
	if (!Array.isArray(value)) {
		return undefined;
	}
	for (const entry of value) {
		if (typeof entry === "string" && entry.trim().length > 0) {
			return entry.trim();
		}
	}
	return undefined;
};

const toPrincipalKind = (
	value: string | undefined
): DsarPrincipalKind | undefined =>
	value === "operator" || value === "service" || value === "subject"
		? value
		: undefined;

const getClient = (
	config: UnkeyBearerResolverConfig
): UnkeyBearerResolverClient => {
	if (config.client) {
		return config.client;
	}
	if (!config.rootKey) {
		throw new Error(
			"@dsar/auth-unkey requires either a Unkey client or rootKey."
		);
	}
	return new Unkey({ rootKey: config.rootKey });
};

const getMetadataKeys = (config: UnkeyBearerResolverConfig): MetadataKeys => ({
	email: config.metadataKeys?.email ?? DEFAULT_METADATA_KEYS.email,
	principalKind:
		config.metadataKeys?.principalKind ?? DEFAULT_METADATA_KEYS.principalKind,
	role: config.metadataKeys?.role ?? DEFAULT_METADATA_KEYS.role,
	tenantId: config.metadataKeys?.tenantId ?? DEFAULT_METADATA_KEYS.tenantId,
	workspaceId:
		config.metadataKeys?.workspaceId ?? DEFAULT_METADATA_KEYS.workspaceId,
});

const getRequiredIdentityFields = (input: {
	readonly data: Readonly<Record<string, unknown>>;
	readonly identity: Readonly<Record<string, unknown>> | undefined;
	readonly keyMetadata: Readonly<Record<string, unknown>> | undefined;
	readonly metadataKeys: Pick<MetadataKeys, "tenantId">;
}) => {
	const actorId =
		readString(input.identity, "externalId") ?? readString(input.data, "keyId");
	const tenantId = readString(input.keyMetadata, input.metadataKeys.tenantId);
	if (!actorId || !tenantId) {
		return null;
	}
	return { actorId, tenantId };
};

const getResolvedIdentityParts = (
	result: UnkeyVerifyResultShape,
	config: UnkeyBearerResolverConfig
) => {
	const data = asRecord(result.data);
	if (!data) {
		return null;
	}
	const identity = asRecord(data.identity);
	const keyMetadata = asRecord(data.meta);
	const metadataKeys = getMetadataKeys(config);
	const requiredFields = getRequiredIdentityFields({
		data,
		identity,
		keyMetadata,
		metadataKeys,
	});
	if (!requiredFields) {
		return null;
	}
	return {
		actorId: requiredFields.actorId,
		data,
		identity,
		keyMetadata,
		metadataKeys,
		tenantId: requiredFields.tenantId,
	};
};

const getOptionalIdentityFields = (input: {
	readonly config: UnkeyBearerResolverConfig;
	readonly data: Readonly<Record<string, unknown>>;
	readonly identity: Readonly<Record<string, unknown>> | undefined;
	readonly keyMetadata: Readonly<Record<string, unknown>> | undefined;
	readonly metadataKeys: MetadataKeys;
}) => {
	const workspaceId = readString(
		input.keyMetadata,
		input.metadataKeys.workspaceId
	);
	const role =
		readString(input.keyMetadata, input.metadataKeys.role) ??
		readFirstString(input.data.roles) ??
		input.config.fallbackRole;
	const principalKind =
		toPrincipalKind(
			readString(input.keyMetadata, input.metadataKeys.principalKind)
		) ?? input.config.fallbackPrincipalKind;
	const email =
		readString(input.keyMetadata, input.metadataKeys.email) ??
		readString(input.identity, "email");
	return {
		...(email ? { email } : {}),
		...(principalKind ? { principalKind } : {}),
		...(role ? { role } : {}),
		...(workspaceId ? { workspaceId } : {}),
	};
};

const buildDefaultIdentity = (
	result: UnkeyVerifyResultShape,
	config: UnkeyBearerResolverConfig
): DsarResolvedIdentity | null => {
	const resolvedParts = getResolvedIdentityParts(result, config);
	if (!resolvedParts) {
		return null;
	}
	return {
		actorId: resolvedParts.actorId,
		...getOptionalIdentityFields({
			config,
			data: resolvedParts.data,
			identity: resolvedParts.identity,
			keyMetadata: resolvedParts.keyMetadata,
			metadataKeys: resolvedParts.metadataKeys,
		}),
		tenantId: resolvedParts.tenantId,
	};
};

const isValidResult = (
	result: UnkeyVerifyResultShape | undefined
): result is UnkeyVerifyResultShape =>
	result !== undefined && asRecord(result.data)?.valid === true;

const verifyUnkeyToken = async (
	client: UnkeyBearerResolverClient,
	verifyInput:
		| { readonly key: string }
		| { readonly key: string; readonly permissions: string }
): Promise<UnkeyVerifyResultShape | undefined> => {
	try {
		return (await client.keys.verifyKey(verifyInput)) as UnkeyVerifyResultShape;
	} catch {
		return undefined;
	}
};

/**
 * Creates a DSAR-compatible bearer-token resolver backed by Unkey key
 * verification.
 *
 * @param config - Resolver configuration, including Unkey client/root key, metadata mapping, and optional identity overrides.
 * @returns A `resolveBearerToken`-compatible function that maps verified Unkey keys into DSAR identities.
 */
export const makeUnkeyBearerResolver = (config: UnkeyBearerResolverConfig) => {
	const client = getClient(config);
	return async (input: {
		readonly request: Request;
		readonly token: string;
	}): Promise<DsarResolvedIdentity | null | undefined> => {
		const verifyInput = config.permissions
			? { key: input.token, permissions: config.permissions }
			: { key: input.token };
		const result = await verifyUnkeyToken(client, verifyInput);
		if (!isValidResult(result)) {
			return undefined;
		}
		const defaultIdentity = buildDefaultIdentity(result, config);
		if (!config.mapIdentity) {
			return defaultIdentity ?? undefined;
		}
		return (
			(await config.mapIdentity({
				defaultIdentity,
				request: input.request,
				result,
				token: input.token,
			})) ?? undefined
		);
	};
};

export type {
	DsarPrincipalKind,
	DsarResolvedIdentity,
	UnkeyBearerResolverClient,
	UnkeyBearerResolverConfig,
	UnkeyVerifyResultShape,
} from "./types";
