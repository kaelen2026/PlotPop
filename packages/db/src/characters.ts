import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "./client.js";
import {
  asset,
  character,
  characterVersion,
  characterVersionAsset,
  series,
  workspaceMember,
} from "./schema.js";
import type { WorkspaceScope } from "./series.js";

/**
 * The handle inside `db.transaction`. Named here because the reference image helpers below
 * only ever run inside one — pinning has to share the transaction that wrote the version.
 */
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * One reference image a version pins (§32.1).
 *
 * The storage key is here because signing a url from it is the api's job, not this
 * package's: the key never leaves the api, and what reaches a caller is a short-lived
 * signed url (§26).
 */
export type CharacterReferenceImage = {
  readonly assetId: string;
  readonly contentType: string;
  readonly storageKey: string;
};

export type CharacterVersionRecord = {
  readonly version: number;
  readonly appearance: string;
  readonly referenceImages: readonly CharacterReferenceImage[];
  readonly createdAt: Date;
};

/** A character as the api reads it, with the version a new episode would use. */
export type CharacterRecord = {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly createdAt: Date;
  readonly currentVersion: CharacterVersionRecord;
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
 * The reference images belonging to a set of versions, grouped by version id.
 *
 * One query for the whole set rather than one per version: a cast of ten characters would
 * otherwise be eleven round trips, and the number of versions in a history is unbounded.
 * Callers have already scoped the version ids through the series, so this does not repeat
 * the ownership condition — it is reading rows it was handed the keys to.
 */
async function referenceImagesByVersion(
  db: Database | Transaction,
  versionIds: readonly string[],
): Promise<Map<string, CharacterReferenceImage[]>> {
  const grouped = new Map<string, CharacterReferenceImage[]>();

  if (versionIds.length === 0) return grouped;

  const rows = await db
    .select({
      characterVersionId: characterVersionAsset.characterVersionId,
      assetId: asset.id,
      contentType: asset.contentType,
      storageKey: asset.storageKey,
    })
    .from(characterVersionAsset)
    .innerJoin(asset, eq(asset.id, characterVersionAsset.assetId))
    .where(inArray(characterVersionAsset.characterVersionId, [...versionIds]))
    .orderBy(asc(characterVersionAsset.position));

  for (const row of rows) {
    /*
     * `content_type` is nullable on the table but cannot be null here: only a `ready` asset
     * is ever pinned (see `pinReferenceImages`), and `asset_ready_is_verified` forbids a
     * ready row without one. Raising rather than substituting a value, because there is no
     * sensible answer to "what type is this file" and inventing one would put a broken
     * image on a page instead of a report that the database was written to behind our back.
     */
    if (row.contentType === null) {
      throw new Error(`Asset ${row.assetId} is pinned to a version but was never verified`);
    }

    const images = grouped.get(row.characterVersionId) ?? [];

    images.push({
      assetId: row.assetId,
      contentType: row.contentType,
      storageKey: row.storageKey,
    });
    grouped.set(row.characterVersionId, images);
  }

  return grouped;
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
      versionId: characterVersion.id,
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

  // A second query for the whole cast's images rather than one per character: two round
  // trips whatever the cast size.
  const images = await referenceImagesByVersion(
    db,
    rows.map((row) => row.versionId),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    revision: row.revision,
    createdAt: row.createdAt,
    currentVersion: {
      version: row.version,
      appearance: row.appearance,
      referenceImages: images.get(row.versionId) ?? [],
      createdAt: row.versionCreatedAt,
    },
  }));
}

export type CharacterCreation = SeriesScope & {
  readonly name: string;
  readonly appearance: string;
  /**
   * Assets already uploaded and confirmed, in the order they should be pinned.
   *
   * Optional with the same default as `characterCreateInputSchema`, so the decision about
   * what "no images given" means is made once rather than differently at each layer.
   */
  readonly referenceAssetIds?: readonly string[];
};

/**
 * Raised when a version was asked to pin an asset it may not have.
 *
 * A distinct error rather than a `null` return, because it has to abort the surrounding
 * transaction: the character or version being written must not commit having silently
 * dropped an image the creator chose. The callers turn it back into the same "not found"
 * every other unreachable id produces.
 */
class UnreachableAssetError extends Error {
  override readonly name = "UnreachableAssetError";
}

/**
 * Pins assets to a version, in the order given.
 *
 * Every id is checked against the workspace that owns the series and against `ready` in the
 * same transaction as the insert. Both halves matter: an asset from someone else's
 * workspace must not be reachable by guessing an id, and a `pending` one has bytes nobody
 * has verified — pinning it would put an unchecked file into a generation input.
 *
 * The count comparison is what makes this total: anything filtered out by either condition
 * is missing from the result, so there is no id that can be quietly skipped.
 */
async function pinReferenceImages(
  tx: Transaction,
  input: {
    readonly characterVersionId: string;
    readonly workspaceId: string;
    readonly assetIds: readonly string[];
  },
): Promise<CharacterReferenceImage[]> {
  if (input.assetIds.length === 0) return [];

  const usable = await tx
    .select({ id: asset.id, contentType: asset.contentType, storageKey: asset.storageKey })
    .from(asset)
    .where(
      and(
        inArray(asset.id, [...input.assetIds]),
        eq(asset.workspaceId, input.workspaceId),
        eq(asset.status, "ready"),
      ),
    );

  if (usable.length !== input.assetIds.length) throw new UnreachableAssetError();

  const byId = new Map(usable.map((row) => [row.id, row]));
  // The caller's order, not the order the database happened to return them in: position is
  // how §32.1's front and back images are told apart.
  const ordered = input.assetIds.map((assetId, position) => {
    const found = byId.get(assetId);

    if (found === undefined || found.contentType === null) throw new UnreachableAssetError();

    return { assetId, position, contentType: found.contentType, storageKey: found.storageKey };
  });

  await tx.insert(characterVersionAsset).values(
    ordered.map((image) => ({
      characterVersionId: input.characterVersionId,
      assetId: image.assetId,
      position: image.position,
    })),
  );

  return ordered.map(({ assetId, contentType, storageKey }) => ({
    assetId,
    contentType,
    storageKey,
  }));
}

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
  try {
    return await db.transaction(async (tx) => {
      const reachable = await tx
        .select({ seriesId: series.id, workspaceId: series.workspaceId })
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
          id: characterVersion.id,
          version: characterVersion.version,
          appearance: characterVersion.appearance,
          createdAt: characterVersion.createdAt,
        });

      const version = versions[0];

      if (version === undefined) return null;

      /*
       * In the same transaction as both rows above. An unusable asset id therefore takes
       * the character with it rather than creating one whose images were silently dropped —
       * a creator who chose a reference image and got a character without it would have no
       * way to tell that anything went wrong.
       */
      const { id: versionId, ...versionColumns } = version;
      const referenceImages = await pinReferenceImages(tx, {
        characterVersionId: versionId,
        workspaceId: found.workspaceId,
        assetIds: creation.referenceAssetIds ?? [],
      });

      return { ...identity, currentVersion: { ...versionColumns, referenceImages } };
    });
  } catch (error) {
    // Answered exactly as an unreachable series is: a caller learns nothing about whether
    // the asset id they guessed exists.
    if (error instanceof UnreachableAssetError) return null;
    throw error;
  }
}

/** A character, and the version of it a caller is asking about. */
export type CharacterScope = SeriesScope & {
  readonly characterId: string;
};

/**
 * One character's versions, newest first — the history §32.7 keeps so a creator can see
 * what an older episode was made with.
 *
 * Scoped through the series and the workspace like every other read here, so a character
 * id from someone else's series has no history to show. Each version carries the images it
 * pinned, which is the point of keeping the history at all: what an older episode was made
 * from includes what it looked at.
 */
export async function listCharacterVersions(
  db: Database,
  scope: CharacterScope,
): Promise<CharacterVersionRecord[]> {
  const rows = await db
    .select({
      id: characterVersion.id,
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

  const images = await referenceImagesByVersion(
    db,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    version: row.version,
    appearance: row.appearance,
    referenceImages: images.get(row.id) ?? [],
    createdAt: row.createdAt,
  }));
}

export type CharacterVersionAddition = CharacterScope & {
  readonly appearance: string;
  /** §20.6: the character's revision as the caller read it. */
  readonly revision: number;
  /**
   * What this version pins, in full. Omitting an image the previous version had removes it
   * from this one — a version is a snapshot, not a change to the last one.
   */
  readonly referenceAssetIds?: readonly string[];
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
  try {
    return await appendVersion(db, addition);
  } catch (error) {
    /*
     * An asset the caller may not pin aborts the whole append, so the version never
     * commits with the image missing. Reported as `missing` rather than a fourth outcome:
     * from the caller's side an id they cannot use and an id that does not exist are the
     * same fact, and distinguishing them would tell a stranger which of their guesses
     * named a real file.
     */
    if (error instanceof UnreachableAssetError) return { outcome: "missing" };
    throw error;
  }
}

async function appendVersion(
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
        id: characterVersion.id,
        version: characterVersion.version,
        appearance: characterVersion.appearance,
        createdAt: characterVersion.createdAt,
      });

    const version = appended[0];

    if (version === undefined) return { outcome: "missing" };

    // The series' workspace, read here rather than taken from the scope, for the same
    // reason `createSeries` writes the id its own query returned.
    const owning = await tx
      .select({ workspaceId: series.workspaceId })
      .from(series)
      .innerJoin(character, eq(character.seriesId, series.id))
      .where(eq(character.id, identity.id))
      .limit(1);

    const workspaceId = owning[0]?.workspaceId;

    if (workspaceId === undefined) return { outcome: "missing" };

    const { id: versionId, ...versionColumns } = version;
    const referenceImages = await pinReferenceImages(tx, {
      characterVersionId: versionId,
      workspaceId,
      assetIds: addition.referenceAssetIds ?? [],
    });

    return {
      outcome: "versioned",
      character: { ...identity, currentVersion: { ...versionColumns, referenceImages } },
    };
  });
}
