import { zValidator } from "@hono/zod-validator";
import type { AuthService } from "@plotpop/auth";
import {
  type Character,
  characterCreateInputSchema,
  seriesSchema,
  workspaceSchema,
} from "@plotpop/contracts";
import {
  type CharacterRecord,
  createCharacter,
  type Database,
  findSeriesForMember,
  listCharactersForSeries,
} from "@plotpop/db";
import { Hono } from "hono";
import { notFound, validationFailed } from "../errors.js";
import { requireSession, type SessionEnv } from "../middleware/session.js";

export type CharacterRouteDependencies = {
  readonly db: Database;
  readonly auth: AuthService;
};

/** The row's own shape is not the payload's; §21 makes the contract the boundary. */
function toPayload(record: CharacterRecord): Character {
  return {
    id: record.id,
    name: record.name,
    revision: record.revision,
    createdAt: record.createdAt.toISOString(),
    currentVersion: {
      version: record.currentVersion.version,
      appearance: record.currentVersion.appearance,
      createdAt: record.currentVersion.createdAt.toISOString(),
    },
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
export function createCharacterRoutes({ db, auth }: CharacterRouteDependencies) {
  return new Hono<SessionEnv>()
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

      return c.json({ characters: characters.map(toPayload) }, 200);
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
        });

        // `null` means the series was not reachable: the write scoped itself, and nothing
        // was stored. Same answer as an id that names nothing.
        if (created === null) return c.json(notFound(), 404);

        return c.json(toPayload(created), 201);
      },
    );
}
