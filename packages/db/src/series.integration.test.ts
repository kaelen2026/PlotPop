import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { coreMigrationSource } from "./migration-source.js";
import { applyMigrations } from "./migrations.js";
import { WORKSPACE_OWNER_ROLE } from "./schema.js";
import { createSeries, listSeriesForWorkspace, renameSeries } from "./series.js";
import { identityFixtureSource } from "./testing/identity.js";
import { createTestDatabase, type TestDatabase } from "./testing/temp-database.js";

/**
 * Series storage (`docs/ai-comic-drama-saas-design.md` §6.1, §20.2).
 *
 * What these pin is the invariant `.claude/rules/workflow.md` §7 states as "the
 * query itself contains the workspace": membership is part of both the read and the
 * write, so a route cannot reach another workspace's series even by passing its id,
 * and cannot forget a check it never had to make.
 *
 * Postgres is real (`.claude/rules/tdd.md` §6). The constraints are half the
 * behaviour here — a blank name and an orphaned series are refused by the database,
 * not by a schema in front of it.
 */

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
  await applyMigrations(database.db, [await identityFixtureSource(), coreMigrationSource]);
});

afterEach(async () => {
  // Cascades reach workspace, workspace_member, credit_account and series.
  await database.db.$client.query('delete from "user"');
});

afterAll(async () => {
  await database.drop();
});

type Member = { readonly userId: string; readonly workspaceId: string };

/**
 * A user with a workspace they own, which is the only shape MVP produces (§20.1).
 * Written with SQL rather than through provisioning, so a test that is about series
 * does not depend on how an account comes into being.
 */
async function createMember(label: string): Promise<Member> {
  const client = database.db.$client;

  await client.query('insert into "user" (id, name, email) values ($1, $1, $2)', [
    label,
    `${label}@plotpop.test`,
  ]);
  const { rows } = await client.query<{ id: string }>(
    "insert into workspace (owner_user_id, name) values ($1, $1) returning id",
    [label],
  );
  const workspaceId = rows[0]?.id as string;

  await client.query(
    "insert into workspace_member (workspace_id, user_id, role) values ($1, $2, $3)",
    [workspaceId, label, WORKSPACE_OWNER_ROLE],
  );

  return { userId: label, workspaceId };
}

describe("creating a series", () => {
  it("stores it in the caller's workspace at revision 1", async () => {
    const nia = await createMember("nia");

    const created = await createSeries(database.db, { ...nia, name: "Rooftop Confessions" });

    expect(created).toMatchObject({ name: "Rooftop Confessions", revision: 1 });
    expect(await listSeriesForWorkspace(database.db, nia)).toEqual([created]);
  });

  /*
   * The whole point of putting membership in the write. A signed-in caller who
   * passes someone else's workspace id must not be able to leave a row there —
   * least of all one the owner would see in their own library.
   */
  it("writes nothing when the caller is not a member of the workspace", async () => {
    const nia = await createMember("nia");
    const ravi = await createMember("ravi");

    const attempt = await createSeries(database.db, {
      workspaceId: nia.workspaceId,
      userId: ravi.userId,
      name: "Someone Else's Series",
    });

    expect(attempt).toBeNull();
    expect(await listSeriesForWorkspace(database.db, nia)).toEqual([]);
  });

  it("refuses a blank name in the database, not only at the boundary", async () => {
    // `docs/implementation-plan.md` §2: Zod parses the boundary, the database keeps
    // integrity. A writer that bypassed the contract must still fail.
    const nia = await createMember("nia");

    await expect(
      database.db.$client.query("insert into series (workspace_id, name) values ($1, '   ')", [
        nia.workspaceId,
      ]),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("refuses a series that belongs to no workspace", async () => {
    await expect(
      database.db.$client.query(
        "insert into series (workspace_id, name) values ('0f1a0f3a-6c4d-4f77-9c0b-1a2b3c4d5e6f', 'Orphan')",
      ),
    ).rejects.toThrow(/violates foreign key constraint/);
  });
});

describe("listing a workspace's series", () => {
  it("returns the newest first, so the library opens on recent work", async () => {
    const nia = await createMember("nia");

    const first = await createSeries(database.db, { ...nia, name: "First" });
    const second = await createSeries(database.db, { ...nia, name: "Second" });
    const third = await createSeries(database.db, { ...nia, name: "Third" });

    const listed = await listSeriesForWorkspace(database.db, nia);

    expect(listed.map((entry) => entry.name)).toEqual(["Third", "Second", "First"]);
    expect(listed.map((entry) => entry.id)).toEqual([third?.id, second?.id, first?.id]);
  });

  it("shows a caller only the series of the workspace they belong to", async () => {
    const nia = await createMember("nia");
    const ravi = await createMember("ravi");

    await createSeries(database.db, { ...nia, name: "Nia's Series" });
    await createSeries(database.db, { ...ravi, name: "Ravi's Series" });

    expect((await listSeriesForWorkspace(database.db, nia)).map((entry) => entry.name)).toEqual([
      "Nia's Series",
    ]);
    expect((await listSeriesForWorkspace(database.db, ravi)).map((entry) => entry.name)).toEqual([
      "Ravi's Series",
    ]);
  });

  /*
   * Empty and forbidden read the same from here on purpose: the route turns an
   * absent workspace into a 404 (`apps/api/src/routes/series.ts`), and this query's
   * job is to make sure no row leaks whatever the route decides.
   */
  it("returns nothing for a workspace the caller is not a member of", async () => {
    const nia = await createMember("nia");
    const ravi = await createMember("ravi");

    await createSeries(database.db, { ...nia, name: "Nia's Series" });

    expect(
      await listSeriesForWorkspace(database.db, {
        workspaceId: nia.workspaceId,
        userId: ravi.userId,
      }),
    ).toEqual([]);
  });
});

describe("renaming a series", () => {
  it("stores the new name and moves the revision on", async () => {
    const nia = await createMember("nia");
    const created = await createSeries(database.db, { ...nia, name: "Rooftop Confessions" });

    const result = await renameSeries(database.db, {
      ...nia,
      seriesId: created?.id as string,
      name: "Rooftop Confessions, Season One",
      revision: 1,
    });

    expect(result).toEqual({
      outcome: "renamed",
      series: expect.objectContaining({
        id: created?.id,
        name: "Rooftop Confessions, Season One",
        // §20.6: the revision is what the next writer has to carry back, so it has to
        // move even though nothing else about the row did.
        revision: 2,
      }),
    });
  });

  /*
   * The invariant `.claude/rules/tdd.md` §3 asks for: a stale write is refused rather
   * than applied. Two creators on the same series is the future; two tabs belonging to
   * one creator is today, and neither should be able to erase the other silently.
   */
  it("refuses a rename that carries a revision the row has moved past", async () => {
    const nia = await createMember("nia");
    const created = await createSeries(database.db, { ...nia, name: "Rooftop Confessions" });
    const seriesId = created?.id as string;

    await renameSeries(database.db, { ...nia, seriesId, name: "Renamed Once", revision: 1 });

    const stale = await renameSeries(database.db, {
      ...nia,
      seriesId,
      name: "Renamed From A Stale Tab",
      revision: 1,
    });

    expect(stale).toEqual({ outcome: "stale" });
    expect((await listSeriesForWorkspace(database.db, nia)).map((entry) => entry.name)).toEqual([
      "Renamed Once",
    ]);
  });

  it("tells a stale revision apart from a series that does not exist", async () => {
    // The caller can act on the difference: one means read again, the other means the
    // series is gone. Answering both the same way would make the first unrecoverable.
    const nia = await createMember("nia");

    expect(
      await renameSeries(database.db, {
        ...nia,
        seriesId: "0f1a0f3a-6c4d-4f77-9c0b-1a2b3c4d5e6f",
        name: "Nothing",
        revision: 1,
      }),
    ).toEqual({ outcome: "missing" });
  });

  it("will not rename a series in a workspace the caller is not a member of", async () => {
    const nia = await createMember("nia");
    const ravi = await createMember("ravi");
    const created = await createSeries(database.db, { ...nia, name: "Rooftop Confessions" });

    const attempt = await renameSeries(database.db, {
      workspaceId: nia.workspaceId,
      userId: ravi.userId,
      seriesId: created?.id as string,
      name: "Taken Over",
      revision: 1,
    });

    // Missing, not stale: a stranger learns nothing about the revision of a series
    // they cannot see.
    expect(attempt).toEqual({ outcome: "missing" });
    expect((await listSeriesForWorkspace(database.db, nia)).map((entry) => entry.name)).toEqual([
      "Rooftop Confessions",
    ]);
  });

  it("keeps one of two concurrent renames and reports the other as stale", async () => {
    const nia = await createMember("nia");
    const created = await createSeries(database.db, { ...nia, name: "Rooftop Confessions" });
    const seriesId = created?.id as string;

    const [first, second] = await Promise.all([
      renameSeries(database.db, { ...nia, seriesId, name: "From Tab One", revision: 1 }),
      renameSeries(database.db, { ...nia, seriesId, name: "From Tab Two", revision: 1 }),
    ]);

    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(["renamed", "stale"]);

    const [stored] = await listSeriesForWorkspace(database.db, nia);
    expect(stored?.revision).toBe(2);
  });
});
