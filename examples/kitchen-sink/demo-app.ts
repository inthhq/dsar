import { Database } from "bun:sqlite";

export interface DemoUser {
	readonly createdAt: string;
	readonly deletedAt: string | null;
	readonly email: string;
	readonly name: string;
	readonly plan: string;
}

export interface DemoSession {
	readonly deletedAt: string | null;
	readonly id: string;
	readonly ip: string;
	readonly lastSeen: string;
}

export interface DemoOrder {
	readonly amountCents: number;
	readonly createdAt: string;
	readonly deletedAt: string | null;
	readonly id: string;
	readonly sku: string;
}

export interface DemoSlice<T> {
	readonly live: number;
	readonly preview: readonly T[];
	readonly total: number;
}

export interface DemoPerson {
	readonly orders: DemoSlice<DemoOrder>;
	readonly sessions: DemoSlice<DemoSession>;
	readonly user: DemoUser | null;
}

const PREVIEW_LIMIT = 5;

const nowIso = (): string => new Date().toISOString();

const seedRows = [
	{
		email: "ada@example.com",
		name: "Ada Lovelace",
		orders: [
			{ amountCents: 4200, sku: "ANALYTICAL-ENGINE" },
			{ amountCents: 1900, sku: "NOTEBOOK-G" },
		],
		plan: "pro",
		sessions: 2,
	},
	{
		email: "kaylee@kaylee.dev",
		name: "Kaylee Williams",
		orders: [
			{ amountCents: 2900, sku: "STUDIO-PLAN" },
			{ amountCents: 800, sku: "ADD-ON-SEATS" },
		],
		plan: "team",
		sessions: 1,
	},
	{
		email: "subject@example.com",
		name: "Portal Demo Subject",
		orders: [{ amountCents: 1200, sku: "STARTER" }],
		plan: "free",
		sessions: 1,
	},
	{
		email: "sam@example.com",
		name: "Sam Rivera",
		orders: [{ amountCents: 5400, sku: "ENTERPRISE" }],
		plan: "enterprise",
		sessions: 3,
	},
] as const;

export const openDemoApp = (filename: string) => {
	const db = new Database(filename, { create: true });
	db.exec(`
		CREATE TABLE IF NOT EXISTS users (
			email TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			plan TEXT NOT NULL,
			created_at TEXT NOT NULL,
			deleted_at TEXT
		);
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL,
			ip TEXT NOT NULL,
			last_seen TEXT NOT NULL,
			deleted_at TEXT
		);
		CREATE TABLE IF NOT EXISTS orders (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL,
			sku TEXT NOT NULL,
			amount_cents INTEGER NOT NULL,
			created_at TEXT NOT NULL,
			deleted_at TEXT
		);
	`);
	const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get() as {
		n: number;
	};
	if (userCount.n === 0) {
		const insertUser = db.prepare(
			"INSERT INTO users (email, name, plan, created_at, deleted_at) VALUES (?, ?, ?, ?, NULL)"
		);
		const insertSession = db.prepare(
			"INSERT INTO sessions (id, email, ip, last_seen, deleted_at) VALUES (?, ?, ?, ?, NULL)"
		);
		const insertOrder = db.prepare(
			"INSERT INTO orders (id, email, sku, amount_cents, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)"
		);
		const createdAt = nowIso();
		for (const [index, person] of seedRows.entries()) {
			insertUser.run(person.email, person.name, person.plan, createdAt);
			for (let session = 0; session < person.sessions; session += 1) {
				insertSession.run(
					`ses_${index}_${session}`,
					person.email,
					`203.0.113.${String(10 + index + session)}`,
					createdAt
				);
			}
			for (const [orderIndex, order] of person.orders.entries()) {
				insertOrder.run(
					`ord_${index}_${orderIndex}`,
					person.email,
					order.sku,
					order.amountCents,
					createdAt
				);
			}
		}
	}

	const countSessions = db.prepare(
		"SELECT COUNT(*) AS n FROM sessions WHERE lower(email) = ?"
	);
	const countLiveSessions = db.prepare(
		"SELECT COUNT(*) AS n FROM sessions WHERE lower(email) = ? AND deleted_at IS NULL"
	);
	const countOrders = db.prepare(
		"SELECT COUNT(*) AS n FROM orders WHERE lower(email) = ?"
	);
	const countLiveOrders = db.prepare(
		"SELECT COUNT(*) AS n FROM orders WHERE lower(email) = ? AND deleted_at IS NULL"
	);

	const lookupByEmail = (email: string): DemoPerson => {
		const normalized = email.trim().toLowerCase();
		const user = db
			.prepare(
				"SELECT email, name, plan, created_at AS createdAt, deleted_at AS deletedAt FROM users WHERE lower(email) = ?"
			)
			.get(normalized) as DemoUser | undefined;
		const sessionCounts = {
			live: (countLiveSessions.get(normalized) as { n: number }).n,
			total: (countSessions.get(normalized) as { n: number }).n,
		};
		const orderCounts = {
			live: (countLiveOrders.get(normalized) as { n: number }).n,
			total: (countOrders.get(normalized) as { n: number }).n,
		};
		const sessions = db
			.prepare(
				"SELECT id, ip, last_seen AS lastSeen, deleted_at AS deletedAt FROM sessions WHERE lower(email) = ? ORDER BY last_seen DESC LIMIT ?"
			)
			.all(normalized, PREVIEW_LIMIT) as DemoSession[];
		const orders = db
			.prepare(
				"SELECT id, sku, amount_cents AS amountCents, created_at AS createdAt, deleted_at AS deletedAt FROM orders WHERE lower(email) = ? ORDER BY created_at DESC LIMIT ?"
			)
			.all(normalized, PREVIEW_LIMIT) as DemoOrder[];
		return {
			orders: {
				live: orderCounts.live,
				preview: orders,
				total: orderCounts.total,
			},
			sessions: {
				live: sessionCounts.live,
				preview: sessions,
				total: sessionCounts.total,
			},
			user: user ?? null,
		};
	};

	const eraseByEmail = (email: string): { readonly deleted: number } => {
		const normalized = email.trim().toLowerCase();
		const sessions = db
			.prepare("DELETE FROM sessions WHERE lower(email) = ?")
			.run(normalized);
		const orders = db
			.prepare("DELETE FROM orders WHERE lower(email) = ?")
			.run(normalized);
		const users = db
			.prepare("DELETE FROM users WHERE lower(email) = ?")
			.run(normalized);
		return {
			deleted:
				Number(users.changes) +
				Number(sessions.changes) +
				Number(orders.changes),
		};
	};

	const exportByEmail = (email: string) => {
		const normalized = email.trim().toLowerCase();
		const person = lookupByEmail(normalized);
		const allSessions = db
			.prepare(
				"SELECT id, ip, last_seen AS lastSeen, deleted_at AS deletedAt FROM sessions WHERE lower(email) = ? ORDER BY last_seen DESC"
			)
			.all(normalized) as DemoSession[];
		const allOrders = db
			.prepare(
				"SELECT id, sku, amount_cents AS amountCents, created_at AS createdAt, deleted_at AS deletedAt FROM orders WHERE lower(email) = ? ORDER BY created_at DESC"
			)
			.all(normalized) as DemoOrder[];
		return {
			exportedAt: nowIso(),
			orders: allOrders,
			sessions: allSessions,
			user: person.user,
		};
	};

	const correctByEmail = (input: {
		readonly email: string;
		readonly name?: string;
		readonly plan?: string;
	}): DemoUser | null => {
		const normalized = input.email.trim().toLowerCase();
		const current = db
			.prepare(
				"SELECT email, name, plan, created_at AS createdAt, deleted_at AS deletedAt FROM users WHERE lower(email) = ?"
			)
			.get(normalized) as DemoUser | undefined;
		if (current === undefined) {
			return null;
		}
		const name =
			input.name !== undefined && input.name.trim().length > 0
				? input.name.trim()
				: current.name;
		const plan =
			input.plan !== undefined && input.plan.trim().length > 0
				? input.plan.trim()
				: current.plan;
		db.prepare(
			"UPDATE users SET name = ?, plan = ? WHERE lower(email) = ?"
		).run(name, plan, normalized);
		return { ...current, name, plan };
	};

	return { correctByEmail, eraseByEmail, exportByEmail, lookupByEmail };
};

export const demoPeoplePath = "/demo/people";
export const demoWebhookPath = "/demo/webhooks/dsar";
