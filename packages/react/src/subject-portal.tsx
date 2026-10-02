"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useId, useState } from "react";

import { DsarBrowserError } from "./client";
import { useDsarClient } from "./provider";

interface RequestRow {
	readonly id: string;
	readonly status?: string;
	readonly receivedAt?: string;
}

/** Props for {@link SubjectPortal}. */
export interface SubjectPortalProps {
	/** Launch-pack jurisdiction, default `eu`. */
	readonly defaultJurisdiction?: string;
	/** Identifier used for GET /subjects/:subjectId. Must match the signed-in subject. */
	readonly subjectId: string;
	/** Prefills the email field. Also used to match the filing to this subject. */
	readonly defaultEmail?: string;
}

const JURISDICTIONS = [
	{ label: "European Union (GDPR)", value: "eu" },
	{ label: "United Kingdom", value: "uk" },
	{ label: "United States", value: "us" },
	{ label: "California (CPRA)", value: "us-ca" },
	{ label: "Virginia (VCDPA)", value: "us-va" },
	{ label: "Colorado (CPA)", value: "us-co" },
] as const;

const detailsPrompt = (requestType: string): string => {
	if (requestType === "access") {
		return "Anything to include in the copy?";
	}
	if (requestType === "delete") {
		return "Anything we should know before erasing?";
	}
	if (requestType === "correct") {
		return "What is wrong today?";
	}
	if (requestType === "portability") {
		return "Any systems to include in the export?";
	}
	return "What do you need?";
};

const REQUEST_TYPES = [
	{ label: "Access my data", value: "access" },
	{ label: "Delete my data", value: "delete" },
	{ label: "Correct my data", value: "correct" },
	{ label: "Export my data", value: "portability" },
	{ label: "Something else", value: "other" },
] as const;

const formatWhen = (value: string | undefined): string | undefined => {
	if (value === undefined) {
		return undefined;
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
};

/**
 * Subject-facing intake and request list for the portal example.
 *
 * @param props - Portal configuration.
 * @param props.defaultEmail - Prefills the email field.
 * @param props.defaultJurisdiction - Launch-pack jurisdiction, default `eu`.
 * @param props.subjectId - Subject id for GET /subjects/:subjectId.
 * @returns The subject portal UI.
 */
export const SubjectPortal = (props: SubjectPortalProps) => {
	const { defaultEmail = "", defaultJurisdiction = "eu", subjectId } = props;
	const client = useDsarClient();
	const nameId = useId();
	const emailId = useId();
	const jurisdictionId = useId();
	const typeId = useId();
	const detailsId = useId();
	const [name, setName] = useState("");
	const [email, setEmail] = useState(defaultEmail);
	const [jurisdiction, setJurisdiction] = useState(defaultJurisdiction);
	const [requestType, setRequestType] = useState("access");
	const [rawText, setRawText] = useState("");
	const [correctedName, setCorrectedName] = useState("");
	const [correctedPlan, setCorrectedPlan] = useState("");
	const [rows, setRows] = useState<readonly RequestRow[]>([]);
	const [alertMessage, setAlertMessage] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const refresh = useCallback(async () => {
		const profile = await client.get<{
			readonly requests?: readonly RequestRow[];
		}>(`/subjects/${encodeURIComponent(subjectId)}`);
		setRows(profile.requests ?? []);
	}, [client, subjectId]);

	useEffect(() => {
		refresh().catch((error: unknown) => {
			setAlertMessage(
				error instanceof DsarBrowserError
					? error.message
					: "Failed to load requests"
			);
		});
	}, [refresh]);

	const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmedEmail = email.trim();
		if (trimmedEmail.length === 0) {
			setAlertMessage("Add an email so we can match this request to you.");
			return;
		}
		setPending(true);
		setAlertMessage(null);
		try {
			const correctionLines = [
				requestType === "correct" && correctedName.trim().length > 0
					? `Correct name to: ${correctedName.trim()}`
					: undefined,
				requestType === "correct" && correctedPlan.trim().length > 0
					? `Correct plan to: ${correctedPlan.trim()}`
					: undefined,
			].filter((line) => line !== undefined);
			const details = rawText.trim();
			const composed = [...correctionLines, details].filter(
				(line) => line.length > 0
			);
			await client.post("/requests", {
				intakeSource: {
					channel: "web",
					rawText:
						composed.length > 0
							? composed.join("\n")
							: `Please ${requestType} my personal data.`,
					receivedAt: new Date().toISOString(),
					type: "portal",
				},
				jurisdiction,
				requestType,
				requestor: {
					email: trimmedEmail,
					...(name.trim().length > 0 ? { name: name.trim() } : {}),
					type: "subject",
				},
				subject: {
					email: trimmedEmail,
					subjectId,
				},
			});
			await refresh();
			setRawText("");
		} catch (error) {
			setAlertMessage(
				error instanceof DsarBrowserError
					? error.message
					: "Could not file this request"
			);
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="dsar-root">
			<h1>Privacy requests</h1>
			<p className="dsar-lede">
				Access, delete, correct, or export. The operator queue works each type
				against the Acme account for this email.
			</p>
			<div className="dsar-panel">
				<form className="dsar-form" onSubmit={onSubmit}>
					<label className="dsar-field" htmlFor={nameId}>
						<span>Full name</span>
						<input
							autoComplete="name"
							id={nameId}
							name="name"
							onChange={(event) => setName(event.target.value)}
							value={name}
						/>
					</label>
					<label className="dsar-field" htmlFor={emailId}>
						<span>Email</span>
						<input
							autoComplete="email"
							id={emailId}
							name="email"
							onChange={(event) => setEmail(event.target.value)}
							required
							type="email"
							value={email}
						/>
					</label>
					<label className="dsar-field" htmlFor={jurisdictionId}>
						<span>Where do you live?</span>
						<select
							id={jurisdictionId}
							name="jurisdiction"
							onChange={(event) => setJurisdiction(event.target.value)}
							value={jurisdiction}
						>
							{JURISDICTIONS.map((item) => (
								<option key={item.value} value={item.value}>
									{item.label}
								</option>
							))}
						</select>
					</label>
					<label className="dsar-field" htmlFor={typeId}>
						<span>Request type</span>
						<select
							id={typeId}
							name="requestType"
							onChange={(event) => setRequestType(event.target.value)}
							value={requestType}
						>
							{REQUEST_TYPES.map((item) => (
								<option key={item.value} value={item.value}>
									{item.label}
								</option>
							))}
						</select>
					</label>
					{requestType === "correct" ? (
						<>
							<label className="dsar-field">
								<span>Correct name to</span>
								<input
									name="correctedName"
									onChange={(event) => setCorrectedName(event.target.value)}
									value={correctedName}
								/>
							</label>
							<label className="dsar-field">
								<span>Correct plan to</span>
								<input
									name="correctedPlan"
									onChange={(event) => setCorrectedPlan(event.target.value)}
									placeholder="free, team, pro, enterprise"
									value={correctedPlan}
								/>
							</label>
						</>
					) : null}
					<label className="dsar-field" htmlFor={detailsId}>
						<span>{detailsPrompt(requestType)}</span>
						<textarea
							id={detailsId}
							name="rawText"
							onChange={(event) => setRawText(event.target.value)}
							value={rawText}
						/>
					</label>
					<div className="dsar-actions">
						<button disabled={pending} type="submit">
							{pending ? "Filing…" : "File request"}
						</button>
					</div>
				</form>
				{alertMessage === null ? null : (
					<p className="dsar-alert" role="alert">
						{alertMessage}
					</p>
				)}
				<p className="dsar-list-title">Your requests</p>
				{rows.length === 0 ? (
					<p className="dsar-empty">None yet. File one above.</p>
				) : (
					<ul className="dsar-list">
						{rows.map((row) => (
							<li className="dsar-item" key={row.id}>
								<div className="dsar-item-main">
									<strong>{formatWhen(row.receivedAt) ?? "Filed"}</strong>
									<span className="dsar-meta" title={row.id}>
										{row.id.slice(0, 8)}
									</span>
								</div>
								{row.status === undefined ? null : (
									<span className="dsar-status">{row.status}</span>
								)}
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};
