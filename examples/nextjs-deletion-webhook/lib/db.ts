import fs from "node:fs";

/** Demo user record stored in the application database. */
export interface DemoUser {
	readonly id: string;
	readonly email: string;
	readonly name: string;
	readonly status: string;
}

/**
 * Lightweight, zero-dependency demo database manager for quickstarts
 * and serverless deployments (Vercel, Node, Bun).
 */
export class DemoDatabase {
	private readonly filePath: string;
	private users: Map<string, DemoUser> = new Map();

	constructor(
		filePath = process.env.DEMO_DATABASE_PATH ?? ".demo-users.json"
	) {
		this.filePath = filePath;
		this.load();
	}

	private load(): void {
		if (fs.existsSync(this.filePath)) {
			try {
				const data = fs.readFileSync(this.filePath, "utf8");
				const list: readonly DemoUser[] = JSON.parse(data);
				this.users = new Map(list.map((user) => [user.email, user]));
			} catch {
				this.users = new Map();
			}
		}
	}

	private save(): void {
		try {
			const list = Array.from(this.users.values());
			fs.writeFileSync(
				this.filePath,
				JSON.stringify(list, null, 2),
				"utf8"
			);
		} catch {
			// Ignore filesystem write errors in read-only serverless environments
		}
	}

	/** Seeds initial user records into the demo database. */
	seed(): readonly DemoUser[] {
		const demoUsers: readonly DemoUser[] = [
			{
				email: "alex.subject@example.com",
				id: "usr_alex_123",
				name: "Alex Subject",
				status: "active",
			},
			{
				email: "jordan.user@example.com",
				id: "usr_jordan_456",
				name: "Jordan User",
				status: "active",
			},
		];
		for (const user of demoUsers) {
			this.users.set(user.email, user);
		}
		this.save();
		return demoUsers;
	}

	/** Deletes a demo user record by email. */
	deleteByEmail(email: string): boolean {
		const existed = this.users.has(email);
		if (existed) {
			this.users.delete(email);
			this.save();
		}
		return existed;
	}

	/** Looks up a demo user record by email. */
	findByEmail(email: string): DemoUser | undefined {
		return this.users.get(email);
	}
}

let dbInstance: DemoDatabase | undefined;

/**
 * Returns a shared demo database instance.
 *
 * @param dbPath - Optional path to user data store file.
 */
export const getDb = (dbPath?: string): DemoDatabase => {
	if (!dbInstance) {
		dbInstance = new DemoDatabase(dbPath);
	}
	return dbInstance;
};

/** Seeds demo users. */
export const seedDemoUsers = (dbPath?: string): readonly DemoUser[] =>
	getDb(dbPath).seed();

/** Deletes demo user by email. */
export const deleteDemoUserByEmail = (
	email: string,
	dbPath?: string
): boolean => getDb(dbPath).deleteByEmail(email);

/** Finds demo user by email. */
export const findDemoUserByEmail = (
	email: string,
	dbPath?: string
): DemoUser | undefined => getDb(dbPath).findByEmail(email);
