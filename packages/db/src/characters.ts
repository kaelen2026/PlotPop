import { and, asc, desc, eq, max, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "./client.js";
import { character, characterVersion, series, workspaceMember } from "./schema.js";
import type { WorkspaceScope } from "./series.js";

/** A character as the api reads it, with the version a new episode would use. */
export type CharacterRecord = {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly createdAt: Date;
  readonly currentVersion: {
    readonly version: number;
    readonly appearance: string;
    readonly createdAt: Date;
  };
};

/** The same table again, so the "which version is current" subquery can correlate to it. */
const latestVersion = alias(characterVersion, "latest_version");

/** A character always sits inside a series, which always sits inside a workspace. */
export type SeriesScope = WorkspaceScope & {
  readonly seriesId: string;
};

/*
 * Ownership reaches two levels here, and both are in every query: the series has to be
 * in the workspace the caller named, and the caller has to be a member of it. Pairing
 * your own workspace with someone else's series is the mistake this shape makes
 * impossible rather than merely wrong (`.claude/rules/workflow.md` §7).
 */
function withinReachableSeries(scope: SeriesScope) {
  return and(
    eq(series.id, scope.seriesId),
    eq(series.workspaceId, scope.workspaceId),
    eq(workspaceMember.userId, scope.userId),
  );
}

/**
 * One series' cast, oldest first, each with its current version.
 *
 * Oldest first, unlike the series library: a cast is read as a cast, and people remember
 * it in the order they built it. `createdAt` and the id together keep the order total
 * once a cursor is added (§21).
 *
 * "Current" is the highest version number a character has. Nothing else has to be kept
 * in step for that to stay true, which is why there is no pointer column to go stale.
 */
export async function listCharactersForSeries(
  db: Database,
  scope: SeriesScope,
): Promise<CharacterRecord[]> {
  const rows = await db
    .select({
      id: character.id,
      name: character.name,
      revision: character.revision,
      createdAt: character.createdAt,
      version: characterVersion.version,
      appearance: characterVersion.appearance,
      versionCreatedAt: characterVersion.createdAt,
    })
    .from(character)
    .innerJoin(series, eq(series.id, character.seriesId))
    .innerJoin(workspaceMember, eq(workspaceMember.workspaceId, series.workspaceId))
    /*
     * The current version, chosen inside the join rather than by reading every version
     * and picking in memory: a character accumulates versions for as long as it is
     * worked on, and a list of ten characters should not read a hundred rows. The
     * subquery is correlated against an alias of the same table, and
     * `character_version (character_id, version desc)` is the index it reads.
     */
    .innerJoin(
      characterVersion,
      and(
        eq(characterVersion.characterId, character.id),
        eq(
          characterVersion.version,
          sql`(${db
            .select({ version: max(latestVersion.version) })
            .from(latestVersion)
            .where(eq(latestVersion.characterId, character.id))})`,
        ),
      ),
    )
    .where(withinReachableSeries(scope))
    .orderBy(asc(character.createdAt), asc(character.id));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    revision: row.revision,
    createdAt: row.createdAt,
    currentVersion: {
      version: row.version,
      appearance: row.appearance,
      createdAt: row.versionCreatedAt,
    },
  }));
}

export type CharacterCreation = SeriesScope & {
  readonly name: string;
  readonly appearance: string;
};

/**
 * Creates a character together with its first version, or returns `null` if the caller
 * cannot reach the series they named.
 *
 * Both rows in one transaction, because §32.7 makes the version the thing a shot pins
 * to: a character that committed without one would be a row that looks like progress
 * and generates nothing. The series id written is the one the reachability query
 * returned, not the one the caller passed.
 */
export async function createCharacter(
  db: Database,
  creation: CharacterCreation,
): Promise<CharacterRecord | null> {
  return db.transaction(async (tx) => {
    const reachable = await tx
      .select({ seriesId: series.id })
      .from(series)
      .innerJoin(workspaceMember, eq(workspaceMember.workspaceId, series.workspaceId))
      .where(withinReachableSeries(creation))
      .limit(1);

    const found = reachable[0];

    if (found === undefined) return null;

    const created = await tx
      .insert(character)
      .values({ seriesId: found.seriesId, name: creation.name })
      .returning({
        id: character.id,
        name: character.name,
        revision: character.revision,
        createdAt: character.createdAt,
      });

    const identity = created[0];

    if (identity === undefined) return null;

    const versions = await tx
      .insert(characterVersion)
      .values({ characterId: identity.id, version: 1, appearance: creation.appearance })
      .returning({
        version: characterVersion.version,
        appearance: characterVersion.appearance,
        createdAt: characterVersion.createdAt,
      });

    const version = versions[0];

    if (version === undefined) return null;

    return { ...identity, currentVersion: version };
  });
}

/** A character, and the version of it a caller is asking about. */
export type CharacterScope = SeriesScope & {
  readonly characterId: string;
};

export type CharacterVersionRecord = {
  readonly version: number;
  readonly appearance: string;
  readonly createdAt: Date;
};

/**
 * One character's versions, newest first — the history §32.7 keeps so a creator can see
 * what an older episode was made with.
 *
 * Scoped through the series and the workspace like every other read here, so a character
 * id from someone else's series has no history to show.
 */
export async function listCharacterVersions(
  db: Database,
  scope: CharacterScope,
): Promise<CharacterVersionRecord[]> {
  return db
    .select({
      version: characterVersion.version,
      appearance: characterVersion.appearance,
      createdAt: characterVersion.createdAt,
    })
    .from(characterVersion)
    .innerJoin(character, eq(character.id, characterVersion.characterId))
    .innerJoin(series, eq(series.id, character.seriesId))
    .innerJoin(workspaceMember, eq(workspaceMember.workspaceId, series.workspaceId))
    .where(and(eq(character.id, scope.characterId), withinReachableSeries(scope)))
    .orderBy(desc(characterVersion.version));
}

export type CharacterVersionAddition = CharacterScope & {
  readonly appearance: string;
  /** §20.6: the character's revision as the caller read it. */
  readonly revision: number;
};

/**
 * What happened to a new version.
 *
 * The same three outcomes as renaming a series, for the same reasons: `stale` is
 * recoverable by reading again, while a character the caller may not see is always
 * missing, so a stranger is never told they guessed a revision wrong.
 */
export type CharacterVersionResult =
  | { readonly outcome: "versioned"; readonly character: CharacterRecord }
  | { readonly outcome: "stale" }
  | { readonly outcome: "missing" };

/**
 * Appends a version to a character, if the character is still at the revision the caller
 * read.
 *
 * Nothing is ever rewritten: an episode generated with version 2 has to keep finding
 * version 2 (§32.7), so the earlier rows are left exactly as they are.
 *
 * The conditional update on the identity comes first, and it is what makes this safe under
 * concurrency: it takes the row's lock, so a second writer waits, then finds the revision
 * has moved and is told `stale` rather than appending a second version 2. The
 * `unique (character_id, version)` constraint is the backstop behind that, not the
 * mechanism.
 */
export async function addCharacterVersion(
  db: Database,
  addition: CharacterVersionAddition,
): Promise<CharacterVersionResult> {
  return db.transaction(async (tx) => {
    const reachable = tx
      .select({ id: character.id })
      .from(character)
      .innerJoin(series, eq(series.id, character.seriesId))
      .innerJoin(workspaceMember, eq(workspaceMember.workspaceId, series.workspaceId))
      .where(and(eq(character.id, addition.characterId), withinReachableSeries(addition)));

    const claimed = await tx
      .update(character)
      .set({ revision: sql`${character.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(character.revision, addition.revision), sql`${character.id} in (${reachable})`))
      .returning({
        id: character.id,
        name: character.name,
        revision: character.revision,
        createdAt: character.createdAt,
      });

    const identity = claimed[0];

    if (identity === undefined) {
      /*
       * Either the revision moved or the character is not the caller's to see. The
       * classification read shares this transaction, so the answer describes one moment.
       */
      const existing = await tx
        .select({ id: character.id })
        .from(character)
        .innerJoin(series, eq(series.id, character.seriesId))
        .innerJoin(workspaceMember, eq(workspaceMember.workspaceId, series.workspaceId))
        .where(and(eq(character.id, addition.characterId), withinReachableSeries(addition)))
        .limit(1);

      return existing[0] === undefined ? { outcome: "missing" } : { outcome: "stale" };
    }

    const previous = await tx
      .select({ latest: max(characterVersion.version) })
      .from(characterVersion)
      .where(eq(characterVersion.characterId, identity.id));

    const nextVersion = (previous[0]?.latest ?? 0) + 1;

    const appended = await tx
      .insert(characterVersion)
      .values({ characterId: identity.id, version: nextVersion, appearance: addition.appearance })
      .returning({
        version: characterVersion.version,
        appearance: characterVersion.appearance,
        createdAt: characterVersion.createdAt,
      });

    const version = appended[0];

    if (version === undefined) return { outcome: "missing" };

    return { outcome: "versioned", character: { ...identity, currentVersion: version } };
  });
}
