import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  addCharacterVersion,
  createCharacter,
  listCharactersForSeries,
  listCharacterVersions,
} from "./characters.js";
import { coreMigrationSource } from "./migration-source.js";
import { applyMigrations } from "./migrations.js";
import { WORKSPACE_OWNER_ROLE } from "./schema.js";
import { createSeries } from "./series.js";
import { identityFixtureSource } from "./testing/identity.js";
import { createTestDatabase, type TestDatabase } from "./testing/temp-database.js";

/**
 * Character storage (`docs/ai-comic-drama-saas-design.md` §20.2, §32.7).
 *
 * Two things are pinned here. Ownership reaches two levels now — a character belongs to
 * a series, which belongs to a workspace — and every read and write is scoped through
 * both, so naming someone else's series is not a way to read or write their cast.
 *
 * And a character is never stored without a version. §32.7 splits the two so that
 * improving an appearance cannot rewrite a shipped episode; a character with no version
 * would be a row that looks like progress and generates nothing.
 */

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
  await applyMigrations(database.db, [await identityFixtureSource(), coreMigrationSource]);
});

afterEach(async () => {
  // Cascades reach workspace, series, character and character_version.
  await database.db.$client.query('delete from "user"');
});

afterAll(async () => {
  await database.drop();
});

type Member = { readonly userId: string; readonly workspaceId: string };

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

async function memberWithSeries(label: string): Promise<Member & { readonly seriesId: string }> {
  const member = await createMember(label);
  const series = await createSeries(database.db, { ...member, name: `${label}'s Series` });

  return { ...member, seriesId: series?.id as string };
}

const APPEARANCE = "Mid twenties, cropped black hair, round glasses, oversized grey coat.";

describe("creating a character", () => {
  it("stores the identity and its first version together", async () => {
    const nia = await memberWithSeries("nia");

    const created = await createCharacter(database.db, {
      ...nia,
      name: "Ada",
      appearance: APPEARANCE,
    });

    expect(created).toMatchObject({
      name: "Ada",
      revision: 1,
      currentVersion: { version: 1, appearance: APPEARANCE },
    });
    expect(await listCharactersForSeries(database.db, nia)).toEqual([created]);
  });

  it("writes nothing when the series belongs to someone else", async () => {
    const nia = await memberWithSeries("nia");
    const ravi = await memberWithSeries("ravi");

    const attempt = await createCharacter(database.db, {
      workspaceId: nia.workspaceId,
      seriesId: nia.seriesId,
      userId: ravi.userId,
      name: "Taken Over",
      appearance: APPEARANCE,
    });

    expect(attempt).toBeNull();
    expect(await listCharactersForSeries(database.db, nia)).toEqual([]);
  });

  it("writes nothing when the series is not in the workspace that was named", async () => {
    // The workspace comes from the url and the series id from the path after it. A
    // caller who pairs their own workspace with someone else's series must not slip
    // through on the strength of the first half.
    const nia = await memberWithSeries("nia");
    const ravi = await memberWithSeries("ravi");

    const attempt = await createCharacter(database.db, {
      workspaceId: nia.workspaceId,
      seriesId: ravi.seriesId,
      userId: nia.userId,
      name: "Wrong Series",
      appearance: APPEARANCE,
    });

    expect(attempt).toBeNull();
    expect(await listCharactersForSeries(database.db, ravi)).toEqual([]);
  });

  it("refuses a blank appearance in the database, not only at the boundary", async () => {
    const nia = await memberWithSeries("nia");
    const { rows } = await database.db.$client.query<{ id: string }>(
      "insert into character (series_id, name) values ($1, 'Ada') returning id",
      [nia.seriesId],
    );

    await expect(
      database.db.$client.query(
        "insert into character_version (character_id, version, appearance) values ($1, 1, '   ')",
        [rows[0]?.id],
      ),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("refuses two versions claiming the same number", async () => {
    // The uniqueness is what makes "version 2" mean one thing when two writers both
    // read version 1 and both try to add the next one.
    const nia = await memberWithSeries("nia");
    const created = await createCharacter(database.db, {
      ...nia,
      name: "Ada",
      appearance: APPEARANCE,
    });

    const { rows } = await database.db.$client.query<{ id: string }>(
      "select id from character where series_id = $1",
      [nia.seriesId],
    );

    expect(created?.currentVersion.version).toBe(1);
    await expect(
      database.db.$client.query(
        "insert into character_version (character_id, version, appearance) values ($1, 1, 'Duplicate')",
        [rows[0]?.id],
      ),
    ).rejects.toThrow(/duplicate key value/);
  });
});

describe("listing a series' cast", () => {
  it("returns them in the order they were written, with their current version", async () => {
    const nia = await memberWithSeries("nia");

    await createCharacter(database.db, { ...nia, name: "Ada", appearance: APPEARANCE });
    await createCharacter(database.db, { ...nia, name: "Bao", appearance: "Tall, shaved head." });

    const listed = await listCharactersForSeries(database.db, nia);

    // Oldest first, unlike the series library: a cast is read as a cast, and people
    // remember it in the order they built it.
    expect(listed.map((entry) => entry.name)).toEqual(["Ada", "Bao"]);
    expect(listed.map((entry) => entry.currentVersion.appearance)).toEqual([
      APPEARANCE,
      "Tall, shaved head.",
    ]);
  });

  it("shows a caller nothing from a series they cannot reach", async () => {
    const nia = await memberWithSeries("nia");
    const ravi = await memberWithSeries("ravi");

    await createCharacter(database.db, { ...nia, name: "Ada", appearance: APPEARANCE });

    expect(
      await listCharactersForSeries(database.db, {
        workspaceId: nia.workspaceId,
        seriesId: nia.seriesId,
        userId: ravi.userId,
      }),
    ).toEqual([]);
  });

  it("keeps each series' cast to itself", async () => {
    const nia = await memberWithSeries("nia");
    const second = await createSeries(database.db, { ...nia, name: "Second Series" });

    await createCharacter(database.db, { ...nia, name: "Ada", appearance: APPEARANCE });
    await createCharacter(database.db, {
      workspaceId: nia.workspaceId,
      userId: nia.userId,
      seriesId: second?.id as string,
      name: "Bao",
      appearance: "Tall, shaved head.",
    });

    expect((await listCharactersForSeries(database.db, nia)).map((entry) => entry.name)).toEqual([
      "Ada",
    ]);
  });
});

describe("adding a version to a character", () => {
  it("appends the next version and leaves the earlier one exactly as it was", async () => {
    const nia = await memberWithSeries("nia");
    const created = await createCharacter(database.db, {
      ...nia,
      name: "Ada",
      appearance: APPEARANCE,
    });
    const characterId = created?.id as string;

    const result = await addCharacterVersion(database.db, {
      ...nia,
      characterId,
      appearance: "Now with a shaved head.",
      revision: created?.revision as number,
    });

    expect(result).toEqual({
      outcome: "versioned",
      character: expect.objectContaining({
        id: characterId,
        name: "Ada",
        // The identity's revision moves so the next writer has to carry it back (§20.6).
        revision: 2,
        currentVersion: expect.objectContaining({
          version: 2,
          appearance: "Now with a shaved head.",
        }),
      }),
    });

    /*
     * The point of §32.7: an episode generated with version 1 has to keep finding version
     * 1, unchanged. History is appended to, never rewritten.
     */
    const versions = await listCharacterVersions(database.db, { ...nia, characterId });
    expect(versions.map((entry) => [entry.version, entry.appearance])).toEqual([
      [2, "Now with a shaved head."],
      [1, APPEARANCE],
    ]);
  });

  it("refuses a version that carries a revision the character has moved past", async () => {
    const nia = await memberWithSeries("nia");
    const created = await createCharacter(database.db, {
      ...nia,
      name: "Ada",
      appearance: APPEARANCE,
    });
    const characterId = created?.id as string;
    const fromRevisionOne = { ...nia, characterId, appearance: "Second", revision: 1 };

    expect((await addCharacterVersion(database.db, fromRevisionOne)).outcome).toBe("versioned");

    const stale = await addCharacterVersion(database.db, {
      ...fromRevisionOne,
      appearance: "From A Stale Tab",
    });

    expect(stale).toEqual({ outcome: "stale" });
    // Nothing was appended: a refused write leaves no version behind to explain later.
    expect(
      (await listCharacterVersions(database.db, { ...nia, characterId })).map(
        (entry) => entry.version,
      ),
    ).toEqual([2, 1]);
  });

  it("keeps one of two concurrent versions and reports the other as stale", async () => {
    const nia = await memberWithSeries("nia");
    const created = await createCharacter(database.db, {
      ...nia,
      name: "Ada",
      appearance: APPEARANCE,
    });
    const characterId = created?.id as string;

    const [first, second] = await Promise.all([
      addCharacterVersion(database.db, {
        ...nia,
        characterId,
        appearance: "From Tab One",
        revision: 1,
      }),
      addCharacterVersion(database.db, {
        ...nia,
        characterId,
        appearance: "From Tab Two",
        revision: 1,
      }),
    ]);

    expect([first.outcome, second.outcome].sort()).toEqual(["stale", "versioned"]);
    // And version 2 means one thing, which is what `unique (character_id, version)` is for.
    expect(
      (await listCharacterVersions(database.db, { ...nia, characterId })).map(
        (entry) => entry.version,
      ),
    ).toEqual([2, 1]);
  });

  it("will not version a character in a series the caller cannot reach", async () => {
    const nia = await memberWithSeries("nia");
    const ravi = await memberWithSeries("ravi");
    const created = await createCharacter(database.db, {
      ...nia,
      name: "Ada",
      appearance: APPEARANCE,
    });

    const attempt = await addCharacterVersion(database.db, {
      workspaceId: nia.workspaceId,
      seriesId: nia.seriesId,
      userId: ravi.userId,
      characterId: created?.id as string,
      appearance: "Taken Over",
      revision: 1,
    });

    // Missing, not stale: a stranger learns nothing about the revision of a character
    // they cannot see.
    expect(attempt).toEqual({ outcome: "missing" });
  });

  it("tells an unknown character apart from a stale revision", async () => {
    const nia = await memberWithSeries("nia");

    expect(
      await addCharacterVersion(database.db, {
        ...nia,
        characterId: "0f1a0f3a-6c4d-4f77-9c0b-1a2b3c4d5e6f",
        appearance: "Nothing",
        revision: 1,
      }),
    ).toEqual({ outcome: "missing" });
  });

  it("shows no history for a character the caller cannot reach", async () => {
    const nia = await memberWithSeries("nia");
    const ravi = await memberWithSeries("ravi");
    const created = await createCharacter(database.db, {
      ...nia,
      name: "Ada",
      appearance: APPEARANCE,
    });

    expect(
      await listCharacterVersions(database.db, {
        workspaceId: nia.workspaceId,
        seriesId: nia.seriesId,
        userId: ravi.userId,
        characterId: created?.id as string,
      }),
    ).toEqual([]);
  });
});
