import { and, desc, eq, exists, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { series, workspaceMember } from "./schema.js";

/** A series as the api reads it. Rows carry more; this is what callers need. */
export type SeriesRecord = {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly createdAt: Date;
};

export type WorkspaceScope = {
  readonly workspaceId: string;
  readonly userId: string;
};

/** Projected rather than `select()`ing the row, so a new column is never returned by accident. */
const seriesColumns = {
  id: series.id,
  name: series.name,
  revision: series.revision,
  createdAt: series.createdAt,
};

/**
 * One workspace's library, newest first.
 *
 * Membership is part of the query rather than a check the route performs first: a
 * route that forgot the check would still compile, whereas this cannot return a row
 * the caller has no claim to (`.claude/rules/workflow.md` §7). A caller who is not
 * a member sees the same empty list as a member with no series — the route is what
 * turns an unknown workspace into a 404, and this query's job is that no row leaks
 * whatever the route decides.
 */
export async function listSeriesForWorkspace(
  db: Database,
  scope: WorkspaceScope,
): Promise<SeriesRecord[]> {
  return (
    db
      .select(seriesColumns)
      .from(series)
      .innerJoin(workspaceMember, eq(workspaceMember.workspaceId, series.workspaceId))
      .where(
        and(eq(series.workspaceId, scope.workspaceId), eq(workspaceMember.userId, scope.userId)),
      )
      // Newest first, so the library opens on recent work. The id breaks ties, which
      // is what keeps the order total once a cursor is added (§21).
      .orderBy(desc(series.createdAt), desc(series.id))
  );
}

export type SeriesCreation = WorkspaceScope & {
  readonly name: string;
};

/**
 * Creates a series, and returns `null` if the caller is not a member of the
 * workspace they named.
 *
 * The membership test lives in this function rather than in the routes, so there is
 * no version of "create a series" that can be called without it. Both statements
 * run in one transaction, and the workspace id written is the one the membership
 * row returned rather than the one the caller passed — the two cannot drift apart
 * even if this function is later given a wider input.
 */
export async function createSeries(
  db: Database,
  creation: SeriesCreation,
): Promise<SeriesRecord | null> {
  return db.transaction(async (tx) => {
    const membership = await tx
      .select({ workspaceId: workspaceMember.workspaceId })
      .from(workspaceMember)
      .where(
        and(
          eq(workspaceMember.workspaceId, creation.workspaceId),
          eq(workspaceMember.userId, creation.userId),
        ),
      )
      .limit(1);

    const member = membership[0];

    if (member === undefined) return null;

    const rows = await tx
      .insert(series)
      .values({ workspaceId: member.workspaceId, name: creation.name })
      .returning(seriesColumns);

    return rows[0] ?? null;
  });
}

export type SeriesRename = WorkspaceScope & {
  readonly seriesId: string;
  readonly name: string;
  /** §20.6: the revision the caller read, which the update is conditional on. */
  readonly revision: number;
};

/**
 * What happened to a rename.
 *
 * Three outcomes rather than a nullable record, because the caller can act on the
 * difference: `stale` means read the series again and decide what to do about the
 * change someone else made, while `missing` means there is nothing to read. Collapsing
 * them would make the first unrecoverable and would also tell a stranger the revision
 * of a series they cannot see.
 */
export type SeriesRenameResult =
  | { readonly outcome: "renamed"; readonly series: SeriesRecord }
  | { readonly outcome: "stale" }
  | { readonly outcome: "missing" };

/**
 * Renames a series if it is still at the revision the caller read.
 *
 * The update is conditional (§20.6): membership, workspace and revision are all in the
 * `where`, so a stale or foreign write matches no row rather than being applied and
 * reported afterwards. Two concurrent renames therefore end with one winner and one
 * `stale`, decided by Postgres rather than by whichever request arrived first.
 *
 * The follow-up read only classifies a miss, and it shares the update's transaction so
 * the answer describes one moment rather than two.
 */
export async function renameSeries(
  db: Database,
  rename: SeriesRename,
): Promise<SeriesRenameResult> {
  return db.transaction(async (tx) => {
    const belongsToCaller = and(
      eq(series.id, rename.seriesId),
      eq(series.workspaceId, rename.workspaceId),
      exists(
        tx
          .select({ one: sql`1` })
          .from(workspaceMember)
          .where(
            and(
              eq(workspaceMember.workspaceId, series.workspaceId),
              eq(workspaceMember.userId, rename.userId),
            ),
          ),
      ),
    );

    const renamed = await tx
      .update(series)
      .set({ name: rename.name, revision: sql`${series.revision} + 1`, updatedAt: new Date() })
      .where(and(belongsToCaller, eq(series.revision, rename.revision)))
      .returning(seriesColumns);

    const row = renamed[0];

    if (row !== undefined) return { outcome: "renamed", series: row };

    const existing = await tx.select(seriesColumns).from(series).where(belongsToCaller).limit(1);

    return existing[0] === undefined ? { outcome: "missing" } : { outcome: "stale" };
  });
}
