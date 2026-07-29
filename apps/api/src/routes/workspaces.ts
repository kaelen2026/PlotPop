import type { AuthService } from "@plotpop/auth";
import { type Workspace, workspaceSchema } from "@plotpop/contracts";
import {
  type Database,
  findPersonalWorkspace,
  findWorkspaceForMember,
  listWorkspacesForUser,
  provisionDefaultWorkspace,
  type WorkspaceRecord,
} from "@plotpop/db";
import { Hono } from "hono";
import { notFound } from "../errors.js";
import { requireSession, type SessionEnv } from "../middleware/session.js";

export type WorkspaceRouteDependencies = {
  readonly db: Database;
  readonly auth: AuthService;
};

/** The row's own shape is not the payload's; §21 makes the contract the boundary. */
function toPayload(record: WorkspaceRecord): Workspace {
  return {
    id: record.id,
    name: record.name,
    revision: record.revision,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * The workspaces a caller may see. Nothing here takes a workspace id from the
 * caller and trusts it: the repository scopes every read by membership, so an id
 * belonging to someone else answers exactly as an id belonging to nobody does.
 *
 * Routes are chained, and each response states its status, so `AppType` carries
 * both the success and the error shape into the RPC client
 * (`docs/implementation-plan.md` §8.1).
 */
export function createWorkspaceRoutes({ db, auth }: WorkspaceRouteDependencies) {
  return (
    new Hono<SessionEnv>()
      .use(requireSession(auth))
      .get("/", async (c) => {
        const workspaces = await listWorkspacesForUser(db, c.var.user.id);

        return c.json({ workspaces: workspaces.map(toPayload) }, 200);
      })
      /*
       * Registered before `/:workspaceId` on purpose: Hono matches in registration
       * order, and the parameterised route would otherwise swallow "current" and
       * try to read it as an id.
       */
      .get("/current", async (c) => {
        const user = c.var.user;
        const personal = await findPersonalWorkspace(db, user.id);

        /*
         * Provisioned here when it is missing, not just at sign-up.
         *
         * Better Auth commits the user row before running its create hook, so a
         * database hiccup during sign-up leaves an account with nowhere to work and
         * no second sign-up to fix it. Since provisioning is idempotent, the read
         * path can close that gap itself, and the same call also covers accounts
         * created by anything other than the email sign-up route.
         */
        const workspace =
          personal ??
          (await provisionDefaultWorkspace(db, {
            userId: user.id,
            name: user.name,
            email: user.email,
          }));

        return c.json(toPayload(workspace), 200);
      })
      .get("/:workspaceId", async (c) => {
        // A malformed id is answered like an unknown one. Handing it to Postgres as
        // a uuid would raise a driver error, and a `500` would tell the caller that
        // their input reached the database.
        const workspaceId = workspaceSchema.shape.id.safeParse(c.req.param("workspaceId"));

        if (!workspaceId.success) {
          return c.json(notFound(), 404);
        }

        const found = await findWorkspaceForMember(db, {
          workspaceId: workspaceId.data,
          userId: c.var.user.id,
        });

        if (found === null) {
          return c.json(notFound(), 404);
        }

        return c.json(toPayload(found), 200);
      })
  );
}
