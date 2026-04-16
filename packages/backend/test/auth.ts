export const TEST_TENANT_ID = "tenant-default";
export const TEST_ADMIN_TOKEN = "test-admin-token";
export const TEST_MEMBER_TOKEN = "test-member-token";
export const TEST_SUBJECT_TOKEN = "test-subject-token";

export const TEST_ADMIN_HEADERS = {
	authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
} as const;

export const TEST_MEMBER_HEADERS = {
	authorization: `Bearer ${TEST_MEMBER_TOKEN}`,
} as const;

export const TEST_SUBJECT_HEADERS = {
	authorization: `Bearer ${TEST_SUBJECT_TOKEN}`,
} as const;

export const TEST_RUNTIME_AUTH = {
	config: {
		auth: {
			staticBearerTokens: {
				[TEST_ADMIN_TOKEN]: {
					actorId: "tester-admin",
					principalKind: "operator",
					role: "admin",
					tenantId: TEST_TENANT_ID,
				},
				[TEST_MEMBER_TOKEN]: {
					actorId: "tester-member",
					principalKind: "operator",
					role: "member",
					tenantId: TEST_TENANT_ID,
				},
				[TEST_SUBJECT_TOKEN]: {
					actorId: "subject-1",
					email: "subject@example.com",
					principalKind: "subject",
					role: "subject",
					tenantId: TEST_TENANT_ID,
				},
			},
		},
	},
} as const;
