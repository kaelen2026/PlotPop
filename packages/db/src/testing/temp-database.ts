import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { closeDatabase, createDatabase, type Database } from "../client.js";

/*
 * Test-only helpers, reachable at `@plotpop/db/testing` so nothing in a service
 * bundle can import them by accident.
 *
 * `.claude/rules/tdd.md` §6: Postgres is not a system boundary and is not mocked.
 * Every test file gets its own database created from scratch and migrated, which
 * also means "the database can be migrated from zero" is checked continuously
 * rather than once (`docs/implementation-plan.md` §7.4).
 */

/** Matches `docker/compose.yaml`, so a contributor who ran `pnpm docker:up` needs no extra setup. */
const DEFAULT_URL = "postgresql://plotpop:plotpop@localhost:5432/plotpop";

export type TestDatabase = {
  readonly db: Database;
  readonly url: string;
  /** Closes the pool and drops the database. Safe to call more than once. */
  drop(): Promise<void>;
};

function maintenanceUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_URL;
}

function withDatabaseName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;

  return parsed.toString();
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `plotpop_test_${randomBytes(6).toString("hex")}`;
  const admin = new Pool({ connectionString: maintenanceUrl(), max: 1 });

  try {
    // Identifiers cannot be parameterised, so the name is generated here rather
    // than taken from a caller.
    await admin.query(`create database "${name}"`);
  } catch (cause) {
    await admin.end();
    throw new Error(
      `Could not create a test database on ${new URL(maintenanceUrl()).host}. ` +
        "Start the local stack with `pnpm docker:up`.",
      { cause },
    );
  }
  await admin.end();

  const url = withDatabaseName(maintenanceUrl(), name);
  const db = createDatabase({ url, maxConnections: 4 });
  let dropped = false;

  return {
    db,
    url,
    async drop() {
      if (dropped) return;
      dropped = true;
      await closeDatabase(db);

      const cleanup = new Pool({ connectionString: maintenanceUrl(), max: 1 });
      // `force` terminates connections the test left behind; without it a dropped
      // pool that has not finished closing keeps the database alive.
      await cleanup.query(`drop database if exists "${name}" with (force)`);
      await cleanup.end();
    },
  };
}
