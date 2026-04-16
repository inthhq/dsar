import type { RequestsApi } from "../requests";
import type { EndpointContext } from "../types";

type NotificationRequestsApi = Pick<
	RequestsApi,
	"notificationReplay" | "notifications"
>;

/**
 * Creates notification-history endpoints for the Node SDK.
 *
 * @param ctx - Shared endpoint context used to perform HTTP calls.
 * @returns Request endpoints for reading and replaying notifications.
 */
export const makeNotificationRequestsApi = (
	ctx: EndpointContext
): NotificationRequestsApi => ({
	notificationReplay: (requestId, eventId, options) =>
		ctx.call({
			method: "POST",
			options,
			path: `/requests/${requestId}/notifications/${eventId}/replay`,
		}),
	notifications: (requestId, options) =>
		ctx.call({
			method: "GET",
			options,
			path: `/requests/${requestId}/notifications`,
		}),
});
