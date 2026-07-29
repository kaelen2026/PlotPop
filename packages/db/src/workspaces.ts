import { eq, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { creditAccount, WORKSPACE_OWNER_ROLE, workspace, workspaceMember } from "./schema.js";

/** A workspace as the api reads it. Rows carry more; this is what callers need. */
export type WorkspaceRecord = {
  readonly id: string;
  readonly name: string;
  readonly ownerUserId: string;
  readonly revision: number;
  readonly createdAt: Date;
};

export type WorkspaceOwner = {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
};

/**
 * Every workspace the caller belongs to.
 *
 * Scoped by membership rather than by ownership: a list endpoint must not be able
 * to return a workspace the caller is not a member of, and putting that in the
 * query means no caller can forget it (`.claude/rules/workflow.md` §7).
 */
export async function listWorkspacesForUser(
  db: Database,
  userId: string,
): Promise<WorkspaceRecord[]> {
  const rows = await db
    .select({
      id: workspace.id,
      name: workspace.name,
      ownerUserId: workspace.ownerUserId,
      revision: workspace.revision,
      createdAt: workspace.createdAt,
    })
    .from(workspace)
    .innerJoin(workspaceMember, eq(workspaceMember.workspaceId, workspace.id))
    .where(eq(workspaceMember.userId, userId))
    .orderBy(workspace.createdAt, workspace.id);

  return rows;
}

/**
 * A workspace is named after its owner rather than given a generated phrase.
 *
 * `docs/design-system.md` §14 keeps visible copy in the localisation resources, and
 * a name written by the api would be English text living in a database row, out of
 * reach of both. A person's own name needs no translation.
 */
function defaultWorkspaceName(owner: WorkspaceOwner): string {
  const displayName = owner.name.trim();

  if (displayName !== "") return displayName;

  // `workspace.name` rejects a blank string, and a provider can hand us a user
  // with no usable display name. The address's local part always has something.
  const localPart = owner.email.split("@")[0]?.trim();

  return localPart !== undefined && localPart !== "" ? localPart : owner.userId;
}

/**
 * Gives a user the workspace and credit account they need to do anything, and
 * returns the same one however often it is called.
 *
 * §19 runs this after sign-up. Idempotency is not a nicety here: a second
 * workspace raises no error anyone would see, it just leaves a user whose series
 * live somewhere they cannot reach. So the partial unique index on
 * `workspace (owner_user_id) where is_personal` decides the winner, and all three
 * rows are written in one transaction — a workspace without a credit account
 * cannot pay for a generation.
 */
export async function provisionDefaultWorkspace(
  db: Database,
  owner: WorkspaceOwner,
): Promise<WorkspaceRecord> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .insert(workspace)
      .values({
        ownerUserId: owner.userId,
        name: defaultWorkspaceName(owner),
        isPersonal: true,
      })
      /*
       * The assignment is a no-op on purpose. `DO UPDATE` is what makes the
       * statement wait for a concurrent inserter and then return the surviving
       * row; `DO NOTHING` would return nothing, and the follow-up select would
       * miss a row the other transaction had not committed yet.
       *
       * Nothing the owner may have edited is touched: the only column assigned is
       * the conflict key itself.
       */
      .onConflictDoUpdate({
        target: workspace.ownerUserId,
        targetWhere: sql`is_personal`,
        set: { ownerUserId: sql`excluded.owner_user_id` },
      })
      .returning();

    const row = rows[0];

    if (row === undefined) {
      throw new Error(`could not provision a workspace for ${owner.userId}`);
    }

    await tx.insert(creditAccount).values({ workspaceId: row.id }).onConflictDoNothing();
    await tx
      .insert(workspaceMember)
      .values({ workspaceId: row.id, userId: owner.userId, role: WORKSPACE_OWNER_ROLE })
      .onConflictDoNothing();

    return {
      id: row.id,
      name: row.name,
      ownerUserId: row.ownerUserId,
      revision: row.revision,
      createdAt: row.createdAt,
    };
  });
}
