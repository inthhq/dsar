/* oxlint-disable max-statements */
import { asNonEmptyString, asRecord } from "@dsar/guards";
import type { Resend } from "resend";

import { classifyResendErrorCategory, ResendInvocationError } from "./errors";
import type { ResendInboundContent } from "./types";
import { resolveInboundResendErrorCatalogEntry } from "./types/error-codes";

/**
 * Fetches message content for a received Resend email.
 *
 * @param input - Resend client and email identifier used to retrieve the message.
 * @returns Normalized inbound content when the email body is available.
 */
export const defaultContentFetcher = async (input: {
	readonly client: Resend;
	readonly emailId: string;
}): Promise<ResendInboundContent | undefined> => {
	const response = await input.client.emails.receiving.get(input.emailId);
	const parsed = asRecord(response);
	const error = asRecord(parsed?.error);
	if (error) {
		const catalogEntry = resolveInboundResendErrorCatalogEntry(
			"INBOUND_RESEND_CONTENT_FETCH_FAILED"
		);
		const errorMessage =
			asNonEmptyString(error.message) ??
			"Failed to retrieve received email content.";
		throw new ResendInvocationError({
			category: classifyResendErrorCategory(errorMessage),
			details: {
				...(error as Readonly<Record<string, unknown>>),
				docsUrl: catalogEntry.docsUrl,
				errorCode: catalogEntry.code,
				errorId: catalogEntry.id,
				status: catalogEntry.status,
			},
			message: errorMessage,
		});
	}
	const data = asRecord(parsed?.data);
	if (!data) {
		return;
	}
	return {
		headers: asRecord(data.headers),
		html: asNonEmptyString(data.html),
		text: asNonEmptyString(data.text),
	};
};
