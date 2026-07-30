import { zValidator } from "@hono/zod-validator";
import type { AuthService } from "@plotpop/auth";
import {
  type Series,
  seriesCreateInputSchema,
  seriesRenameInputSchema,
  seriesSchema,
  workspaceSchema,
} from "@plotpop/contracts";
import {
  createSeries,
  type Database,
  findSeriesForMember,
  findWorkspaceForMember,
  listSeriesForWorkspace,
  renameSeries,
  type SeriesRecord,
} from "@plotpop/db";
import { Hono } from "hono";
import { notFound, revisionConflict, validationFailed } from "../errors.js";
import { requireSession, type SessionEnv } from "../middleware/session.js";

export type SeriesRouteDependencies = {
  readonly db: Database;
  readonly auth: AuthService;
};

/** The row's own shape is not the payload's; §21 makes the contract the boundary. */
function toPayload(record: SeriesRecord): Series {
  return {
    id: record.id,
    name: record.name,
    revision: record.revision,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Rejects a workspace id Postgres could not read as a uuid.
 *
 * Handing "not-a-uuid" to the driver raises an error, and a `500` would tell the
 * caller that their input reached the database. An unreadable id names nothing, so
 * it is answered exactly as an unknown one is.
 */
function parseWorkspaceId(value: string): string | null {
  const parsed = workspaceSchema.shape.id.safeParse(value);

  return parsed.success ? parsed.data : null;
}

/** The same reasoning for the series' own id. */
function parseSeriesId(value: string): string | null {
  const parsed = seriesSchema.shape.id.safeParse(value);

  return parsed.success ? parsed.data : null;
}

/**
 * A workspace's series (`docs/ai-comic-drama-saas-design.md` §6.1).
 *
 * The workspace is in the url and every handler has to read it, so no series can be
 * read or written without naming the workspace it belongs to (§20.1).
 *
 * The paths are written out here rather than left to the mount point: a parameter
 * that lives in the prefix is `string | undefined` to the handler, and typing it
 * means a misspelled parameter name is a compile error instead of a 404 nobody can
 * explain. The repository scopes both the read and the write by
 * membership, and these handlers add the one thing a query cannot decide: whether an
 * id the caller passed should be reported as missing. It always is — a `403` would
 * confirm that the id names something real, which turns guessing at ids into a way
 * to learn whose work exists.
 */
export function createSeriesRoutes({ db, auth }: SeriesRouteDependencies) {
  return new Hono<SessionEnv>()
    .use(requireSession(auth))
    .get("/:workspaceId/series", async (c) => {
      const workspaceId = parseWorkspaceId(c.req.param("workspaceId"));

      if (workspaceId === null) return c.json(notFound(), 404);

      /*
       * The membership check the empty list cannot make. `listSeriesForWorkspace`
       * answers a foreign workspace and an empty one the same way, on purpose, so
       * that no row can leak; this is what distinguishes them for the caller.
       */
      const workspace = await findWorkspaceForMember(db, { workspaceId, userId: c.var.user.id });

      if (workspace === null) return c.json(notFound(), 404);

      const series = await listSeriesForWorkspace(db, { workspaceId, userId: c.var.user.id });

      return c.json({ series: series.map(toPayload) }, 200);
    })
    .post(
      "/:workspaceId/series",
      /*
       * The same schema the form submits against (`docs/implementation-plan.md` §2),
       * which also gives the RPC client the input type for this route. The failure
       * hook is what keeps the response in the api's one error shape rather than the
       * validator's own (§21).
       */
      zValidator("json", seriesCreateInputSchema, (result, c) =>
        result.success ? undefined : c.json(validationFailed(), 400),
      ),
      async (c) => {
        const workspaceId = parseWorkspaceId(c.req.param("workspaceId"));

        if (workspaceId === null) return c.json(notFound(), 404);

        const created = await createSeries(db, {
          workspaceId,
          userId: c.var.user.id,
          name: c.req.valid("json").name,
        });

        // `null` means the caller is not a member: the write scoped itself, and
        // nothing was stored. Same answer as an id that names nothing.
        if (created === null) return c.json(notFound(), 404);

        return c.json(toPayload(created), 201);
      },
    )
    .get("/:workspaceId/series/:seriesId", async (c) => {
      const workspaceId = parseWorkspaceId(c.req.param("workspaceId"));
      const seriesId = parseSeriesId(c.req.param("seriesId"));

      if (workspaceId === null || seriesId === null) return c.json(notFound(), 404);

      const found = await findSeriesForMember(db, {
        workspaceId,
        seriesId,
        userId: c.var.user.id,
      });

      if (found === null) return c.json(notFound(), 404);

      return c.json(toPayload(found), 200);
    })
    .patch(
      "/:workspaceId/series/:seriesId",
      zValidator("json", seriesRenameInputSchema, (result, c) =>
        result.success ? undefined : c.json(validationFailed(), 400),
      ),
      async (c) => {
        const workspaceId = parseWorkspaceId(c.req.param("workspaceId"));
        const seriesId = parseSeriesId(c.req.param("seriesId"));

        if (workspaceId === null || seriesId === null) return c.json(notFound(), 404);

        const rename = c.req.valid("json");
        const result = await renameSeries(db, {
          workspaceId,
          userId: c.var.user.id,
          seriesId,
          name: rename.name,
          revision: rename.revision,
        });

        /*
         * The repository's three outcomes map onto three answers. `stale` is a `409`
         * the caller can act on — read the series again and decide what to do about
         * the change someone else made — while a series they may not see is missing,
         * so a stranger is never told they guessed a revision wrong.
         */
        if (result.outcome === "missing") return c.json(notFound(), 404);
        if (result.outcome === "stale") return c.json(revisionConflict(), 409);

        return c.json(toPayload(result.series), 200);
      },
    );
}
