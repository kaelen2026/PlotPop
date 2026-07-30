import { zValidator } from "@hono/zod-validator";
import type { AuthService } from "@plotpop/auth";
import {
  type AssetReference,
  assetReferenceSchema,
  type Character,
  type CharacterVersion,
  characterCreateInputSchema,
  characterSchema,
  characterVersionCreateInputSchema,
  seriesSchema,
  workspaceSchema,
} from "@plotpop/contracts";
import {
  addCharacterVersion,
  type CharacterRecord,
  type CharacterVersionRecord,
  createCharacter,
  type Database,
  findSeriesForMember,
  listCharactersForSeries,
  listCharacterVersions,
} from "@plotpop/db";
import { Hono } from "hono";
import { notFound, revisionConflict, validationFailed } from "../errors.js";
import { requireSession, type SessionEnv } from "../middleware/session.js";
import type { ObjectStore } from "../object-store.js";

export type CharacterRouteDependencies = {
  readonly db: Database;
  readonly auth: AuthService;
  readonly store: ObjectStore;
};

/**
 * A version's reference images, each with permission to read it.
 *
 * The urls are signed here rather than behind a separate route because signing is a local
 * computation: a cast of ten would otherwise cost ten extra round trips to say something
 * this response already knows. The storage key stops here — §26 keeps private material
 * behind short-lived urls, and a key is a permanent handle to the object.
 */
async function toReferenceImages(
  record: CharacterVersionRecord,
  store: ObjectStore,
): Promise<AssetReference[]> {
  return Promise.all(
    record.referenceImages.map(async (image) => {
      const signed = await store.presignDownload({ key: image.storageKey });

      return {
        assetId: image.assetId,
        contentType: assetReferenceSchema.shape.contentType.parse(image.contentType),
        url: signed.url,
        expiresAt: signed.expiresAt.toISOString(),
      };
    }),
  );
}

async function toVersionPayload(
  record: CharacterVersionRecord,
  store: ObjectStore,
): Promise<CharacterVersion> {
  return {
    version: record.version,
    appearance: record.appearance,
    referenceImages: await toReferenceImages(record, store),
    createdAt: record.createdAt.toISOString(),
  };
}

/** The row's own shape is not the payload's; §21 makes the contract the boundary. */
async function toPayload(record: CharacterRecord, store: ObjectStore): Promise<Character> {
  return {
    id: record.id,
    name: record.name,
    revision: record.revision,
    createdAt: record.createdAt.toISOString(),
    currentVersion: await toVersionPayload(record.currentVersion, store),
  };
}

/**
 * The two ids in the path, or `null` if either could not be read as a uuid.
 *
 * Handing "not-a-uuid" to the driver raises an error, and a `500` would tell the caller
 * that their input reached the database. An unreadable id names nothing, so it is
 * answered exactly as an unknown one is.
 */
function parsePath(workspaceId: string, seriesId: string) {
  const workspace = workspaceSchema.shape.id.safeParse(workspaceId);
  const series = seriesSchema.shape.id.safeParse(seriesId);

  if (!workspace.success || !series.success) return null;

  return { workspaceId: workspace.data, seriesId: series.data };
}

/** The same reasoning, with the character's own id on the end of the path. */
function parseCharacterPath(workspaceId: string, seriesId: string, characterId: string) {
  const path = parsePath(workspaceId, seriesId);
  const character = characterSchema.shape.id.safeParse(characterId);

  if (path === null || !character.success) return null;

  return { ...path, characterId: character.data };
}

/**
 * A series' cast (`docs/ai-comic-drama-saas-design.md` §20.2, §32.7).
 *
 * Ownership reaches two levels here: the series has to be in the workspace the url names,
 * and the caller has to be a member of that workspace. Both conditions live in the
 * repository's queries, so the pairing that matters — a caller's own workspace with
 * someone else's series — cannot slip through on the strength of the first half.
 *
 * The paths are written out rather than left to the mount point, so both ids reach the
 * handlers typed (`routes/series.ts` says why).
 */
export function createCharacterRoutes({ db, auth, store }: CharacterRouteDependencies) {
  return (
    new Hono<SessionEnv>()
      .use(requireSession(auth))
      .get("/:workspaceId/series/:seriesId/characters", async (c) => {
        const path = parsePath(c.req.param("workspaceId"), c.req.param("seriesId"));

        if (path === null) return c.json(notFound(), 404);

        /*
         * The check an empty list cannot make. `listCharactersForSeries` answers an
         * unreachable series and an empty cast the same way, on purpose, so that no row
         * can leak; this is what distinguishes them for the caller.
         */
        const series = await findSeriesForMember(db, { ...path, userId: c.var.user.id });

        if (series === null) return c.json(notFound(), 404);

        const characters = await listCharactersForSeries(db, { ...path, userId: c.var.user.id });

        return c.json(
          { characters: await Promise.all(characters.map((entry) => toPayload(entry, store))) },
          200,
        );
      })
      .post(
        "/:workspaceId/series/:seriesId/characters",
        zValidator("json", characterCreateInputSchema, (result, c) =>
          result.success ? undefined : c.json(validationFailed(), 400),
        ),
        async (c) => {
          const path = parsePath(c.req.param("workspaceId"), c.req.param("seriesId"));

          if (path === null) return c.json(notFound(), 404);

          const input = c.req.valid("json");
          const created = await createCharacter(db, {
            ...path,
            userId: c.var.user.id,
            name: input.name,
            appearance: input.appearance,
            referenceAssetIds: input.referenceAssetIds,
          });

          // `null` means the series was not reachable: the write scoped itself, and nothing
          // was stored. Same answer as an id that names nothing.
          if (created === null) return c.json(notFound(), 404);

          return c.json(await toPayload(created, store), 201);
        },
      )
      /*
       * A version is appended, never edited, so this is a `POST` to a collection rather than
       * a `PATCH` of the character: an episode generated with version 2 has to keep finding
       * version 2 (§32.7). The revision in the body is what makes the append conditional on
       * the appearance the caller actually read (§20.6).
       */
      .post(
        "/:workspaceId/series/:seriesId/characters/:characterId/versions",
        zValidator("json", characterVersionCreateInputSchema, (result, c) =>
          result.success ? undefined : c.json(validationFailed(), 400),
        ),
        async (c) => {
          const path = parseCharacterPath(
            c.req.param("workspaceId"),
            c.req.param("seriesId"),
            c.req.param("characterId"),
          );

          if (path === null) return c.json(notFound(), 404);

          const input = c.req.valid("json");
          const result = await addCharacterVersion(db, {
            ...path,
            userId: c.var.user.id,
            appearance: input.appearance,
            revision: input.revision,
            referenceAssetIds: input.referenceAssetIds,
          });

          if (result.outcome === "missing") return c.json(notFound(), 404);
          if (result.outcome === "stale") return c.json(revisionConflict(), 409);

          return c.json(await toPayload(result.character, store), 201);
        },
      )
      .get("/:workspaceId/series/:seriesId/characters/:characterId/versions", async (c) => {
        const path = parseCharacterPath(
          c.req.param("workspaceId"),
          c.req.param("seriesId"),
          c.req.param("characterId"),
        );

        if (path === null) return c.json(notFound(), 404);

        const versions = await listCharacterVersions(db, { ...path, userId: c.var.user.id });

        /*
         * A character always has at least one version, so an empty history means the
         * character is not the caller's to see. The absence is the answer here, which is why
         * this route needs no separate reachability read.
         */
        if (versions.length === 0) return c.json(notFound(), 404);

        return c.json(
          {
            versions: await Promise.all(versions.map((entry) => toVersionPayload(entry, store))),
          },
          200,
        );
      })
  );
}
