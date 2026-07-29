import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, createDatabase } from "./client.js";
import { applyMigrations, type MigrationSource } from "./migrations.js";
import { createTestDatabase, type TestDatabase } from "./testing/temp-database.js";

/**
 * The runner is exercised with throwaway sources rather than the repository's own
 * migrations: what is under test is the ledger and the ordering, and a test that
 * asserted on real table names would have to change every time a slice adds one.
 */
async function source(name: string, files: Record<string, string>): Promise<MigrationSource> {
  const directory = await mkdtemp(join(tmpdir(), `plotpop-${name}-`));

  for (const [fileName, sql] of Object.entries(files)) {
    await writeFile(join(directory, fileName), sql, "utf8");
  }

  return { name, directory };
}

async function tableExists(database: TestDatabase, table: string): Promise<boolean> {
  const { rows } = await database.db.$client.query<{ exists: boolean }>(
    "select exists (select from information_schema.tables where table_name = $1) as exists",
    [table],
  );

  return rows[0]?.exists === true;
}

describe("migration runner", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.drop();
  });

  it("migrates an empty database to the latest version and records what it applied", async () => {
    const core = await source("core", {
      "0001_first.sql": "create table first_thing (id text primary key);",
      "0002_second.sql": "create table second_thing (id text primary key);",
    });

    const applied = await applyMigrations(database.db, [core]);

    expect(applied).toEqual([
      { source: "core", version: "0001", name: "first" },
      { source: "core", version: "0002", name: "second" },
    ]);
    expect(await tableExists(database, "first_thing")).toBe(true);
    expect(await tableExists(database, "second_thing")).toBe(true);
  });

  it("applies nothing on a second run over the same sources", async () => {
    const core = await source("repeat", {
      "0001_only.sql": "create table only_thing (id text primary key);",
    });

    await applyMigrations(database.db, [core]);

    expect(await applyMigrations(database.db, [core])).toEqual([]);
  });

  // ADR-007 keeps Better Auth's tables and the business tables on separate
  // migration boundaries in one database, so the business tables can reference
  // `user` only if the order between sources is honoured.
  it("applies sources in the declared order so a later source can reference an earlier one", async () => {
    const identity = await source("identity", {
      "0001_person.sql": "create table person (id text primary key);",
    });
    const business = await source("business", {
      "0001_belonging.sql":
        "create table belonging (id text primary key, person_id text not null references person(id));",
    });

    const applied = await applyMigrations(database.db, [identity, business]);

    expect(applied.map((entry) => entry.source)).toEqual(["identity", "business"]);
  });

  it("tracks each source's versions separately, so both can own a 0001", async () => {
    const left = await source("left", { "0001_left.sql": "create table left_thing (id text);" });
    const right = await source("right", {
      "0001_right.sql": "create table right_thing (id text);",
    });

    await applyMigrations(database.db, [left, right]);

    const { rows } = await database.db.$client.query<{ source: string; version: string }>(
      "select source, version from schema_migration where source in ('left', 'right') order by source",
    );

    expect(rows).toEqual([
      { source: "left", version: "0001" },
      { source: "right", version: "0001" },
    ]);
  });

  it("refuses to run when an applied migration's contents changed", async () => {
    const before = await source("edited", {
      "0001_edited.sql": "create table edited_thing (id text primary key);",
    });
    await applyMigrations(database.db, [before]);

    const after = await source("edited", {
      "0001_edited.sql": "create table edited_thing (id text primary key, extra text);",
    });

    await expect(applyMigrations(database.db, [after])).rejects.toThrow(
      /changed after it was applied/,
    );
  });

  it("refuses a new migration numbered below one already applied", async () => {
    const first = await source("renumber", {
      "0002_later.sql": "create table later_thing (id text primary key);",
    });
    await applyMigrations(database.db, [first]);

    const backfilled = await source("renumber", {
      "0001_earlier.sql": "create table earlier_thing (id text primary key);",
      "0002_later.sql": "create table later_thing (id text primary key);",
    });

    await expect(applyMigrations(database.db, [backfilled])).rejects.toThrow(/renumber it/);
    expect(await tableExists(database, "earlier_thing")).toBe(false);
  });

  // A release step opens the smallest pool it can. Every statement therefore has
  // to go through the one connection the run already holds: reaching back into
  // the pool for a second one waits for a connection that only this run can free.
  it("runs on a pool that allows a single connection", async () => {
    const single = createDatabase({ url: database.url, maxConnections: 1 });
    const core = await source("single", {
      "0001_single.sql": "create table single_thing (id text primary key);",
    });

    try {
      await applyMigrations(single, [core]);
    } finally {
      await closeDatabase(single);
    }

    expect(await tableExists(database, "single_thing")).toBe(true);
  });

  it("leaves no trace of a migration whose statements failed", async () => {
    const broken = await source("broken", {
      "0001_broken.sql": [
        "create table broken_thing (id text primary key);",
        "create table broken_thing (id text primary key);",
      ].join("\n"),
    });

    await expect(applyMigrations(database.db, [broken])).rejects.toThrow(/already exists/);

    expect(await tableExists(database, "broken_thing")).toBe(false);
    const { rows } = await database.db.$client.query(
      "select 1 from schema_migration where source = 'broken'",
    );
    expect(rows).toHaveLength(0);
  });
});
