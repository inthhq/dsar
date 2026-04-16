import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeSlackInboundAdapter } from "#src/adapter";

describe("slack inbound adapter", () => {
	it.effect("validates config and exposes diagnostics", () =>
		Effect.gen(function* _() {
			const adapter = makeSlackInboundAdapter(
				{
					defaultRoute: {
						jurisdiction: "uk",
						tenantId: "tenant-1",
					},
					signingSecret: "signing-secret",
				},
				{
					verifySignature: vi.fn(),
				}
			);

			yield* adapter.validateConfig({ signingSecret: "signing-secret" });
			const diagnostics = yield* adapter.diagnostics();
			expect(diagnostics.key).toBe("slack");
			expect(diagnostics.capability).toBe("inbound");
		})
	);

	it.effect("responds to url verification challenges", () =>
		Effect.gen(function* _() {
			const adapter = makeSlackInboundAdapter(
				{
					defaultRoute: {
						jurisdiction: "uk",
						tenantId: "tenant-1",
					},
					signingSecret: "signing-secret",
				},
				{
					verifySignature: vi.fn(),
				}
			);

			const result = yield* adapter.receive({
				payload: {
					headers: {
						contentType: "application/json",
						signature: "v0=test",
						timestamp: "123",
					},
					rawBody: JSON.stringify({
						challenge: "challenge-123",
						type: "url_verification",
					}),
				},
				source: "slack:webhook",
			});

			expect(result.payload).toStrictEqual({
				challenge: "challenge-123",
				kind: "url_verification",
				provider: "slack",
			});
		})
	);

	it.effect(
		"normalizes app mentions, routes by channel, and parses chat snapshots",
		() =>
			Effect.gen(function* _() {
				const parseChatMessage = vi.fn(() => ({
					attachments: [],
					author: {
						fullName: "Jane Subject",
						id: "U123",
						userName: "jane",
					},
					id: "1766458026.240809",
					metadata: {},
					text: "Subject access request",
					threadId: "slack:C123:1766458026.240809",
				}));
				const adapter = makeSlackInboundAdapter(
					{
						signingSecret: "signing-secret",
						teamRoutes: {
							T123: {
								channels: {
									C123: {
										jurisdiction: "eu",
										tenantId: "tenant-1",
										workspaceId: "workspace-1",
									},
								},
								jurisdiction: "uk",
								tenantId: "tenant-1",
							},
						},
					},
					{
						getUserProfile: () => ({
							email: "subject@example.com",
							name: "Jane Subject",
						}),
						parseChatMessage,
						verifySignature: vi.fn(),
					}
				);

				const result = yield* adapter.receive({
					payload: {
						headers: {
							contentType: "application/json",
							signature: "v0=test",
							timestamp: "123",
						},
						rawBody: JSON.stringify({
							event: {
								channel: "C123",
								channel_type: "channel",
								text: "<@U_BOT> subject access request for my data",
								thread_ts: "1766458026.240809",
								ts: "1766458026.240809",
								type: "app_mention",
								user: "U123",
							},
							event_id: "Ev123",
							team_id: "T123",
							type: "event_callback",
						}),
					},
					source: "slack:webhook",
				});

				expect(result.sourceId).toBe("Ev123");
				expect(result.payload).toMatchObject({
					chat: {
						attachments: [],
						author: {
							fullName: "Jane Subject",
							id: "U123",
							userName: "jane",
						},
						id: "1766458026.240809",
						metadata: {},
						text: "Subject access request",
						threadId: "slack:C123:1766458026.240809",
					},
					eventType: "app_mention",
					intent: {
						isDsar: true,
					},
					kind: "request_capture",
					provider: "slack",
					requestor: {
						email: "subject@example.com",
						id: "U123",
						name: "Jane Subject",
					},
					route: {
						jurisdiction: "eu",
						tenantId: "tenant-1",
						workspaceId: "workspace-1",
					},
					surface: "app_mention",
					teamId: "T123",
				});
				expect(parseChatMessage).toHaveBeenCalledOnce();
			})
	);

	it.effect("routes slash commands through command overrides", () =>
		Effect.gen(function* _() {
			const adapter = makeSlackInboundAdapter(
				{
					signingSecret: "signing-secret",
					teamRoutes: {
						T123: {
							commands: {
								"/dsar": {
									jurisdiction: "ca",
									tenantId: "tenant-2",
								},
							},
							jurisdiction: "uk",
							tenantId: "tenant-1",
						},
					},
				},
				{
					verifySignature: vi.fn(),
				}
			);

			const result = yield* adapter.receive({
				payload: {
					headers: {
						contentType: "application/x-www-form-urlencoded",
						signature: "v0=test",
						timestamp: "123",
					},
					rawBody:
						"command=%2Fdsar&text=please+open+my+request&team_id=T123&channel_id=C321&channel_name=privacy&user_id=U321&user_name=alex&trigger_id=1337.42&response_url=https%3A%2F%2Fexample.test%2Fslack",
				},
				source: "slack:webhook",
			});

			expect(result.sourceId).toBe("1337.42");
			expect(result.payload).toMatchObject({
				command: "/dsar",
				route: {
					jurisdiction: "ca",
					tenantId: "tenant-2",
				},
				surface: "slash_command",
				text: "please open my request",
			});
		})
	);

	it.effect("routes interactive submissions through callback overrides", () =>
		Effect.gen(function* _() {
			const adapter = makeSlackInboundAdapter(
				{
					signingSecret: "signing-secret",
					teamRoutes: {
						T123: {
							callbacks: {
								"dsar-modal": {
									jurisdiction: "us-ca",
									tenantId: "tenant-3",
								},
							},
							jurisdiction: "uk",
							tenantId: "tenant-1",
						},
					},
				},
				{
					verifySignature: vi.fn(),
				}
			);

			const payload = JSON.stringify({
				callback_id: "dsar-modal",
				team: { id: "T123" },
				type: "view_submission",
				user: { id: "U555", name: "Morgan" },
				view: {
					callback_id: "dsar-modal",
					id: "V123",
					state: {
						values: {
							request: {
								message: {
									type: "plain_text_input",
									value: "I need a copy of my data and deletion logs.",
								},
							},
						},
					},
					title: { text: "DSAR intake", type: "plain_text" },
				},
			});

			const result = yield* adapter.receive({
				payload: {
					headers: {
						contentType: "application/x-www-form-urlencoded",
						signature: "v0=test",
						timestamp: "123",
					},
					rawBody: `payload=${encodeURIComponent(payload)}`,
				},
				source: "slack:webhook",
			});

			expect(result.sourceId).toBe("V123");
			expect(result.payload).toMatchObject({
				callbackId: "dsar-modal",
				intent: {
					isDsar: true,
				},
				route: {
					jurisdiction: "us-ca",
					tenantId: "tenant-3",
				},
				surface: "view_submission",
			});
		})
	);

	it.effect(
		"falls back to request metadata when optional profile enrichment throws",
		() =>
			Effect.gen(function* _() {
				const getUserProfile = vi.fn(() => {
					throw new Error("Slack profile lookup timed out");
				});
				const adapter = makeSlackInboundAdapter(
					{
						defaultRoute: {
							jurisdiction: "uk",
							tenantId: "tenant-1",
						},
						signingSecret: "signing-secret",
					},
					{
						getUserProfile,
						verifySignature: vi.fn(),
					}
				);

				const result = yield* adapter.receive({
					payload: {
						headers: {
							contentType: "application/x-www-form-urlencoded",
							signature: "v0=test",
							timestamp: "123",
						},
						rawBody:
							"command=%2Fdsar&text=please+open+my+request&team_id=T123&channel_id=C321&channel_name=privacy&user_id=U321&user_name=alex&trigger_id=1337.42&response_url=https%3A%2F%2Fexample.test%2Fslack",
					},
					source: "slack:webhook",
				});

				expect(getUserProfile).toHaveBeenCalledOnce();
				expect(result.payload).toMatchObject({
					requestor: {
						email: undefined,
						id: "U321",
						name: "alex",
					},
				});
			})
	);

	it.effect(
		"keeps Slack webhook intake working when built-in profile fetch rejects",
		() =>
			Effect.gen(function* _() {
				const fetchMock = vi.fn(() => {
					throw new TypeError("network connection lost");
				});
				vi.stubGlobal("fetch", fetchMock);
				try {
					const adapter = makeSlackInboundAdapter(
						{
							botToken: "xoxb-test",
							defaultRoute: {
								jurisdiction: "uk",
								tenantId: "tenant-1",
							},
							signingSecret: "signing-secret",
						},
						{
							verifySignature: vi.fn(),
						}
					);

					const result = yield* adapter.receive({
						payload: {
							headers: {
								contentType: "application/json",
								signature: "v0=test",
								timestamp: "123",
							},
							rawBody: JSON.stringify({
								event: {
									channel: "C123",
									channel_type: "channel",
									text: "<@U_BOT> subject access request for my data",
									thread_ts: "1766458026.240809",
									ts: "1766458026.240809",
									type: "app_mention",
									user: "U123",
									username: "jane",
								},
								event_id: "Ev123",
								team_id: "T123",
								type: "event_callback",
							}),
						},
						source: "slack:webhook",
					});

					expect(fetchMock).toHaveBeenCalledOnce();
					expect(result.payload).toMatchObject({
						requestor: {
							email: undefined,
							id: "U123",
							name: "jane",
						},
					});
				} finally {
					vi.unstubAllGlobals();
				}
			})
	);

	it.effect(
		"normalizes verification failures into AdapterInvocationError",
		() =>
			Effect.gen(function* _() {
				const adapter = makeSlackInboundAdapter(
					{
						defaultRoute: {
							jurisdiction: "uk",
							tenantId: "tenant-1",
						},
						signingSecret: "signing-secret",
					},
					{
						verifySignature: () => {
							throw new Error("signature verification failed");
						},
					}
				);

				const result = yield* Effect.result(
					adapter.receive({
						payload: {
							headers: {
								contentType: "application/json",
								signature: "v0=test",
								timestamp: "123",
							},
							rawBody: JSON.stringify({
								challenge: "challenge-123",
								type: "url_verification",
							}),
						},
						source: "slack:webhook",
					})
				);

				expect(result._tag).toBe("Failure");
				expect(
					(result as { readonly failure: { readonly _tag: string } }).failure
						._tag
				).toBe("AdapterInvocationError");
			})
	);
});
