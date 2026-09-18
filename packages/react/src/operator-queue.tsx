"use client";

import { useCallback, useEffect, useState } from "react";

import { DsarBrowserError } from "./client";
import { useDsarClient } from "./provider";

interface Requestor {
	readonly email?: string;
	readonly name?: string;
	readonly type?: string;
}

interface QueueItem {
	readonly dueAt?: string;
	readonly id: string;
	readonly receivedAt?: string;
	readonly requestor?: Requestor;
	readonly status?: string;
}

interface RequestDetail {
	readonly capture?: {
		readonly intakeSource?: {
			readonly rawText?: string;
		};
		readonly jurisdiction?: string;
		readonly requestType?: string;
	};
	readonly dueAt?: string;
	readonly id: string;
	readonly intakeSource?: {
		readonly rawText?: string;
	};
	readonly receivedAt?: string;
	readonly requestor?: Requestor;
	readonly status?: string;
}

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

const who = (requestor: Requestor | undefined): string => {
	if (requestor?.name && requestor.name.trim().length > 0) {
		return requestor.name;
	}
	if (requestor?.email && requestor.email.trim().length > 0) {
		return requestor.email;
	}
	return "Unknown requestor";
};

const intakeText = (detail: RequestDetail | undefined): string | undefined => {
	const fromIntake = detail?.intakeSource?.rawText;
	if (typeof fromIntake === "string" && fromIntake.trim().length > 0) {
		return fromIntake;
	}
	const fromCapture = detail?.capture?.intakeSource?.rawText;
	if (typeof fromCapture === "string" && fromCapture.trim().length > 0) {
		return fromCapture;
	}
	return undefined;
};

interface AcmeSlice<T> {
	readonly live: number;
	readonly preview: readonly T[];
	readonly total: number;
}

interface AcmePerson {
	readonly orders: AcmeSlice<{
		readonly amountCents: number;
		readonly createdAt: string;
		readonly deletedAt: string | null;
		readonly sku: string;
	}>;
	readonly sessions: AcmeSlice<{
		readonly deletedAt: string | null;
		readonly id: string;
		readonly ip: string;
		readonly lastSeen: string;
	}>;
	readonly user: {
		readonly deletedAt: string | null;
		readonly email: string;
		readonly name: string;
		readonly plan: string;
	} | null;
}

const fulfilLabel = (requestType: string | undefined, liveRecords: number) => {
	if (requestType === "delete" && liveRecords > 0) {
		return `Erase ${String(liveRecords)} live record${liveRecords === 1 ? "" : "s"}`;
	}
	if (requestType === "delete") {
		return "Confirm data is gone";
	}
	if (requestType === "access") {
		return "Mark as disclosed";
	}
	if (requestType === "portability") {
		return "Mark export complete";
	}
	if (requestType === "correct") {
		return "Mark as corrected";
	}
	return "Mark as handled";
};

const formatMoney = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

const demoOrigin = (dsarBaseUrl: string): string =>
	dsarBaseUrl.replace(/\/api\/v1\/?$/, "");

const demoPeopleUrl = (dsarBaseUrl: string, email: string): string =>
	`${demoOrigin(dsarBaseUrl)}/demo/people?email=${encodeURIComponent(email)}`;

const demoEraseUrl = (dsarBaseUrl: string): string =>
	`${demoOrigin(dsarBaseUrl)}/demo/erase`;

const demoExportUrl = (dsarBaseUrl: string, email: string): string =>
	`${demoOrigin(dsarBaseUrl)}/demo/export?email=${encodeURIComponent(email)}`;

const demoCorrectUrl = (dsarBaseUrl: string): string =>
	`${demoOrigin(dsarBaseUrl)}/demo/correct`;

const holdHint = (
	requestType: string | undefined,
	liveTotal: number
): string => {
	if (requestType === "delete") {
		return `${String(liveTotal)} live record${liveTotal === 1 ? "" : "s"} will be erased. Preview only.`;
	}
	if (requestType === "correct") {
		return "Current values. Apply the correction, then mark as corrected.";
	}
	return `${String(liveTotal)} live record${liveTotal === 1 ? "" : "s"}. Download JSON for the full copy. Preview only.`;
};

const emptyHoldCopy = (
	requestType: string | undefined,
	requestFulfilled: boolean
): string => {
	if (requestFulfilled && requestType === "delete") {
		return "Acme no longer has this email. Lookup returns nothing.";
	}
	if (requestFulfilled) {
		return "No product account for this email.";
	}
	return "No product account for this email. There is nothing to disclose, correct, or erase.";
};

const identityUnlocked = (status: string | undefined): boolean =>
	status === "in_progress" ||
	status === "fulfilled" ||
	status === "refused" ||
	status === "closed";

const IdentityStep = ({
	filerEmail,
	filerName,
	person,
	status,
}: {
	readonly filerEmail: string | undefined;
	readonly filerName: string | undefined;
	readonly person: AcmePerson | null;
	readonly status: string | undefined;
}) => {
	if (status === "captured") {
		return (
			<p className="dsar-meta">
				Look up whether {filerEmail ?? "this email"} has an Acme account. Do not
				disclose or erase until you confirm it is the same person.
			</p>
		);
	}
	if (status !== "verification_pending") {
		return null;
	}
	if (person === null || person.user === null) {
		return (
			<p className="dsar-empty">
				No Acme account for {filerEmail ?? "this email"}. Refuse, or ask the
				filer for another email.
			</p>
		);
	}
	return (
		<div className="dsar-acme">
			<p className="dsar-list-title">Is this the same person?</p>
			<p className="dsar-meta">
				Filer: {filerName ?? "unnamed"} · {filerEmail ?? "no email"}
			</p>
			<p className="dsar-meta">
				Acme: {person.user.name} · {person.user.plan} plan · {person.user.email}
			</p>
		</div>
	);
};

const AcmeRecords = ({
	person,
	requestFulfilled,
	requestType,
}: {
	readonly person: AcmePerson | null;
	readonly requestFulfilled: boolean;
	readonly requestType: string | undefined;
}) => {
	if (person === null || person.user === null) {
		return (
			<div className="dsar-acme">
				<p className="dsar-list-title">Held at Acme</p>
				<p
					className={
						requestFulfilled && requestType === "delete"
							? "dsar-acme-ok"
							: "dsar-empty"
					}
				>
					{emptyHoldCopy(requestType, requestFulfilled)}
				</p>
			</div>
		);
	}
	const liveTotal =
		person.sessions.live +
		person.orders.live +
		(person.user.deletedAt === null ? 1 : 0);
	return (
		<div className="dsar-acme">
			<p className="dsar-list-title">Held at Acme</p>
			<p className="dsar-meta">
				{person.user.name} · {person.user.plan} plan
			</p>
			<p className="dsar-meta">{holdHint(requestType, liveTotal)}</p>
			<table className="dsar-table">
				<caption className="dsar-table-caption">
					Sessions · {String(person.sessions.preview.length)} of{" "}
					{String(person.sessions.total)}
				</caption>
				<thead>
					<tr>
						<th scope="col">ID</th>
						<th scope="col">IP</th>
						<th scope="col">Last seen</th>
						<th scope="col">State</th>
					</tr>
				</thead>
				<tbody>
					{person.sessions.preview.map((session) => (
						<tr
							className={
								session.deletedAt === null ? undefined : "dsar-row-gone"
							}
							key={session.id}
						>
							<td className="dsar-mono">{session.id}</td>
							<td className="dsar-mono">{session.ip}</td>
							<td>{formatWhen(session.lastSeen)}</td>
							<td>{session.deletedAt === null ? "live" : "deleted"}</td>
						</tr>
					))}
				</tbody>
			</table>
			<table className="dsar-table">
				<caption className="dsar-table-caption">
					Orders · {String(person.orders.preview.length)} of{" "}
					{String(person.orders.total)}
				</caption>
				<thead>
					<tr>
						<th scope="col">SKU</th>
						<th className="dsar-num" scope="col">
							Amount
						</th>
						<th scope="col">Placed</th>
						<th scope="col">State</th>
					</tr>
				</thead>
				<tbody>
					{person.orders.preview.map((order) => (
						<tr
							className={order.deletedAt === null ? undefined : "dsar-row-gone"}
							key={order.id}
						>
							<td className="dsar-mono">{order.sku}</td>
							<td className="dsar-num">{formatMoney(order.amountCents)}</td>
							<td>{formatWhen(order.createdAt)}</td>
							<td>{order.deletedAt === null ? "live" : "deleted"}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};

const QueueActions = ({
	busy,
	liveRecords,
	onAction,
	onErase,
	onExport,
	onRefuse,
	path,
	requestType,
	status,
}: {
	readonly busy: boolean;
	readonly liveRecords: number;
	readonly onAction: (path: string, body: unknown) => void;
	readonly onErase: () => void;
	readonly onExport: () => void;
	readonly onRefuse: () => void;
	readonly path: (suffix: string) => string;
	readonly requestType: string | undefined;
	readonly status: string | undefined;
}) => (
	<div className="dsar-actions dsar-actions-row">
		{status === "captured" ? (
			<button
				disabled={busy}
				onClick={() => onAction(path("/verification/request"), {})}
				type="button"
			>
				Look up this email
			</button>
		) : null}
		{status === "verification_pending" ? (
			<>
				<button
					disabled={busy}
					onClick={() => onAction(path("/verification/approve"), {})}
					type="button"
				>
					Yes, same person
				</button>
				<button
					className="dsar-btn-secondary"
					disabled={busy}
					onClick={() => onAction(path("/verification/reject"), {})}
					type="button"
				>
					No, different person
				</button>
			</>
		) : null}
		{status === "in_progress" ? (
			<>
				{requestType === "access" || requestType === "portability" ? (
					<button
						className="dsar-btn-secondary"
						disabled={busy}
						onClick={onExport}
						type="button"
					>
						Download JSON copy
					</button>
				) : null}
				<button
					disabled={busy}
					onClick={() => onAction(path("/fulfilment"), {})}
					type="button"
				>
					{fulfilLabel(requestType, liveRecords)}
				</button>
				<button
					className="dsar-btn-danger"
					disabled={busy}
					onClick={onRefuse}
					type="button"
				>
					Refuse request
				</button>
			</>
		) : null}
		{status === "fulfilled" && requestType === "delete" && liveRecords > 0 ? (
			<button disabled={busy} onClick={onErase} type="button">
				{`Erase leftover ${String(liveRecords)} record${liveRecords === 1 ? "" : "s"}`}
			</button>
		) : null}
		{status === "fulfilled" || status === "refused" ? (
			<button
				className="dsar-btn-secondary"
				disabled={busy}
				onClick={() => onAction(path("/closures"), {})}
				type="button"
			>
				Close request
			</button>
		) : null}
	</div>
);

const CorrectionForm = ({
	busy,
	initialName,
	initialPlan,
	onApply,
}: {
	readonly busy: boolean;
	readonly initialName: string;
	readonly initialPlan: string;
	readonly onApply: (input: { name: string; plan: string }) => void;
}) => {
	const [name, setName] = useState(initialName);
	const [plan, setPlan] = useState(initialPlan);
	return (
		<form
			className="dsar-form"
			onSubmit={(event) => {
				event.preventDefault();
				onApply({ name: name.trim(), plan: plan.trim() });
			}}
		>
			<p className="dsar-list-title">Apply correction</p>
			<label className="dsar-field">
				<span>Name</span>
				<input onChange={(event) => setName(event.target.value)} value={name} />
			</label>
			<label className="dsar-field">
				<span>Plan</span>
				<input onChange={(event) => setPlan(event.target.value)} value={plan} />
			</label>
			<div className="dsar-actions dsar-actions-row">
				<button disabled={busy} type="submit">
					Save to Acme
				</button>
			</div>
		</form>
	);
};

const CorrectionSlot = ({
	busy,
	onCorrect,
	person,
	requestType,
	status,
}: {
	readonly busy: boolean;
	readonly onCorrect: (input: { name: string; plan: string }) => void;
	readonly person: AcmePerson | null;
	readonly requestType: string | undefined;
	readonly status: string | undefined;
}) => {
	if (status !== "in_progress" || requestType !== "correct" || !person?.user) {
		return null;
	}
	return (
		<CorrectionForm
			busy={busy}
			initialName={person.user.name}
			initialPlan={person.user.plan}
			onApply={onCorrect}
		/>
	);
};

const RefuseForm = ({
	busy,
	onAction,
	onRefuseCancel,
	onRefuseReason,
	open,
	path,
	refuseReason,
}: {
	readonly busy: boolean;
	readonly onAction: (path: string, body: unknown) => void;
	readonly onRefuseCancel: () => void;
	readonly onRefuseReason: (value: string) => void;
	readonly open: boolean;
	readonly path: (suffix: string) => string;
	readonly refuseReason: string;
}) => {
	if (!open) {
		return null;
	}
	return (
		<form
			className="dsar-form"
			onSubmit={(event) => {
				event.preventDefault();
				onAction(path("/refusals"), { rationale: refuseReason.trim() });
			}}
		>
			<label className="dsar-field">
				<span>Reason for refusal</span>
				<textarea
					onChange={(event) => onRefuseReason(event.target.value)}
					value={refuseReason}
				/>
			</label>
			<div className="dsar-actions dsar-actions-row">
				<button disabled={busy} type="submit">
					Confirm refusal
				</button>
				<button
					className="dsar-btn-secondary"
					onClick={onRefuseCancel}
					type="button"
				>
					Cancel
				</button>
			</div>
		</form>
	);
};

const EmailLine = ({ email }: { readonly email: string | undefined }) => {
	if (email === undefined) {
		return null;
	}
	return <p className="dsar-meta">{email}</p>;
};

const Quote = ({ text }: { readonly text: string | undefined }) => {
	if (text === undefined) {
		return null;
	}
	return <p className="dsar-quote">{text}</p>;
};

const UnlockedRecords = ({
	person,
	requestType,
	status,
}: {
	readonly person: AcmePerson | null;
	readonly requestType: string | undefined;
	readonly status: string | undefined;
}) => {
	if (!identityUnlocked(status)) {
		return null;
	}
	return (
		<AcmeRecords
			person={person}
			requestFulfilled={status === "fulfilled"}
			requestType={requestType}
		/>
	);
};

const CardHead = ({
	jurisdiction,
	requestType,
	row,
	status,
}: {
	readonly jurisdiction: string | undefined;
	readonly requestType: string | undefined;
	readonly row: QueueItem;
	readonly status: string | undefined;
}) => (
	<div className="dsar-card-head">
		<div className="dsar-item-main">
			<strong>{who(row.requestor)}</strong>
			<span className="dsar-meta">
				{[
					requestType,
					jurisdiction,
					formatWhen(row.receivedAt),
					row.dueAt === undefined ? undefined : `due ${formatWhen(row.dueAt)}`,
				]
					.filter((part) => part !== undefined)
					.join(" · ")}
			</span>
		</div>
		{status === undefined ? null : (
			<span className="dsar-status">{status}</span>
		)}
	</div>
);

const liveRecordCount = (person: AcmePerson | null): number => {
	if (person === null || person.user === null) {
		return 0;
	}
	return (
		person.sessions.live +
		person.orders.live +
		(person.user.deletedAt === null ? 1 : 0)
	);
};

const QueueCard = ({
	busy,
	detail,
	onAction,
	onCorrect,
	onErase,
	onExport,
	onRefuse,
	onRefuseCancel,
	onRefuseReason,
	person,
	refuseOpen,
	refuseReason,
	row,
}: {
	readonly busy: boolean;
	readonly detail: RequestDetail | undefined;
	readonly onAction: (path: string, body: unknown) => void;
	readonly onCorrect: (input: { name: string; plan: string }) => void;
	readonly onErase: () => void;
	readonly onExport: () => void;
	readonly onRefuse: () => void;
	readonly refuseOpen: boolean;
	readonly refuseReason: string;
	readonly row: QueueItem;
}) => {
	const status = detail?.status ?? row.status;
	const text = intakeText(detail);
	const requestType = detail?.capture?.requestType;
	const jurisdiction = detail?.capture?.jurisdiction;
	const path = (suffix: string) =>
		`/requests/${encodeURIComponent(row.id)}${suffix}`;
	const liveRecords = liveRecordCount(person);
	return (
		<li className="dsar-card">
			<CardHead
				jurisdiction={jurisdiction}
				requestType={requestType}
				row={{
					...row,
					requestor: detail?.requestor ?? row.requestor,
				}}
				status={status}
			/>
			<EmailLine email={detail?.requestor?.email} />
			<Quote text={text} />
			<IdentityStep
				filerEmail={detail?.requestor?.email ?? row.requestor?.email}
				filerName={detail?.requestor?.name ?? row.requestor?.name}
				person={person}
				status={status}
			/>
			<UnlockedRecords
				person={person}
				requestType={requestType}
				status={status}
			/>
			<CorrectionSlot
				busy={busy}
				onCorrect={onCorrect}
				person={person}
				requestType={requestType}
				status={status}
			/>
			<QueueActions
				busy={busy}
				liveRecords={liveRecords}
				onAction={onAction}
				onErase={onErase}
				onExport={onExport}
				onRefuse={onRefuse}
				path={path}
				requestType={requestType}
				status={status}
			/>
			<RefuseForm
				busy={busy}
				onAction={onAction}
				onRefuseCancel={onRefuseCancel}
				onRefuseReason={onRefuseReason}
				open={refuseOpen}
				path={path}
				refuseReason={refuseReason}
			/>
		</li>
	);
};

export const OperatorQueue = () => {
	const client = useDsarClient();
	const [rows, setRows] = useState<readonly QueueItem[]>([]);
	const [details, setDetails] = useState<
		Readonly<Record<string, RequestDetail>>
	>({});
	const [alertMessage, setAlertMessage] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [refuseId, setRefuseId] = useState<string | null>(null);
	const [refuseReason, setRefuseReason] = useState("");
	const [people, setPeople] = useState<
		Readonly<Record<string, AcmePerson | null>>
	>({});

	const refresh = useCallback(async () => {
		const listed = await client.get<{ readonly items?: readonly QueueItem[] }>(
			"/requests"
		);
		const items = listed.items ?? [];
		setRows(items);
		const loaded = await Promise.all(
			items.map(async (item) => {
				const detail = await client.get<RequestDetail>(
					`/requests/${encodeURIComponent(item.id)}`
				);
				return [item.id, detail] as const;
			})
		);
		setDetails(Object.fromEntries(loaded));
		const lookedUp = await Promise.all(
			loaded.map(async ([id, detail]) => {
				const email = detail.requestor?.email ?? undefined;
				if (email === undefined) {
					return [id, null] as const;
				}
				const response = await fetch(demoPeopleUrl(client.baseUrl, email), {
					credentials: "include",
				});
				if (!response.ok) {
					return [id, null] as const;
				}
				const person = (await response.json()) as AcmePerson;
				return [id, person] as const;
			})
		);
		setPeople(Object.fromEntries(lookedUp));
	}, [client]);

	useEffect(() => {
		refresh().catch((error: unknown) => {
			setAlertMessage(
				error instanceof DsarBrowserError
					? error.message
					: "Failed to load queue"
			);
		});
	}, [refresh]);

	const runAction = async (id: string, path: string, body: unknown) => {
		setBusyId(id);
		setAlertMessage(null);
		try {
			await client.post(path, body);
			setRefuseId(null);
			setRefuseReason("");
			await refresh();
		} catch (error) {
			setAlertMessage(
				error instanceof DsarBrowserError ? error.message : "Action failed"
			);
		} finally {
			setBusyId(null);
		}
	};

	const exportAcme = async (email: string) => {
		try {
			const response = await fetch(demoExportUrl(client.baseUrl, email), {
				credentials: "include",
			});
			if (!response.ok) {
				setAlertMessage("Could not build an Acme export.");
				return;
			}
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `acme-export-${email}.json`;
			link.click();
			URL.revokeObjectURL(url);
		} catch {
			setAlertMessage("Could not build an Acme export.");
		}
	};

	const correctAcme = async (
		id: string,
		email: string,
		input: { name: string; plan: string }
	) => {
		setBusyId(id);
		setAlertMessage(null);
		try {
			const response = await fetch(demoCorrectUrl(client.baseUrl), {
				body: JSON.stringify({ email, name: input.name, plan: input.plan }),
				credentials: "include",
				headers: { "content-type": "application/json" },
				method: "POST",
			});
			if (!response.ok) {
				setAlertMessage("Could not apply the correction.");
				return;
			}
			await refresh();
		} catch {
			setAlertMessage("Could not apply the correction.");
		} finally {
			setBusyId(null);
		}
	};

	const eraseAcme = async (id: string, email: string) => {
		setBusyId(id);
		setAlertMessage(null);
		try {
			const response = await fetch(demoEraseUrl(client.baseUrl), {
				body: JSON.stringify({ email }),
				credentials: "include",
				headers: { "content-type": "application/json" },
				method: "POST",
			});
			if (!response.ok) {
				setAlertMessage("Could not erase Acme records.");
				return;
			}
			await refresh();
		} catch {
			setAlertMessage("Could not erase Acme records.");
		} finally {
			setBusyId(null);
		}
	};

	return (
		<div className="dsar-root dsar-root-wide">
			<h1>Request queue</h1>
			<p className="dsar-lede">
				Confirm the filer owns the Acme account, then disclose, correct, export,
				or erase. Full product data stays hidden until you say it is the same
				person.
			</p>
			<div className="dsar-panel">
				{alertMessage === null ? null : (
					<p className="dsar-alert" role="alert">
						{alertMessage}
					</p>
				)}
				{rows.length === 0 ? (
					<p className="dsar-empty">
						The queue is empty. File a request in the subject portal, then come
						back here.
					</p>
				) : (
					<ul className="dsar-list">
						{rows.map((row) => (
							<QueueCard
								busy={busyId === row.id}
								detail={details[row.id]}
								key={row.id}
								onAction={(path, body) => {
									if (
										path.endsWith("/refusals") &&
										typeof body === "object" &&
										body !== null &&
										"rationale" in body &&
										typeof body.rationale === "string" &&
										body.rationale.length === 0
									) {
										setAlertMessage("Add a reason to refuse.");
										return;
									}
									void runAction(row.id, path, body);
								}}
								onCorrect={(input) => {
									const email =
										details[row.id]?.requestor?.email ?? row.requestor?.email;
									if (email === undefined) {
										setAlertMessage("No email on this request to correct.");
										return;
									}
									void correctAcme(row.id, email, input);
								}}
								onErase={() => {
									const email =
										details[row.id]?.requestor?.email ?? row.requestor?.email;
									if (email === undefined) {
										setAlertMessage("No email on this request to erase.");
										return;
									}
									void eraseAcme(row.id, email);
								}}
								onExport={() => {
									const email =
										details[row.id]?.requestor?.email ?? row.requestor?.email;
									if (email === undefined) {
										setAlertMessage("No email on this request to export.");
										return;
									}
									void exportAcme(email);
								}}
								onRefuse={() => {
									setRefuseId(row.id);
									setRefuseReason("");
								}}
								onRefuseCancel={() => setRefuseId(null)}
								onRefuseReason={setRefuseReason}
								person={people[row.id] ?? null}
								refuseOpen={refuseId === row.id}
								refuseReason={refuseReason}
								row={row}
							/>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};
