import { z } from "zod";

/**
 * The ownership boundary every business resource hangs off
 * (`docs/ai-comic-drama-saas-design.md` §20.1).
 *
 * The owner's user id is deliberately absent: a caller who can read a workspace is
 * a member of it and learns nothing useful from the owner's identifier, while an
 * identifier in a payload is one more thing that can end up in a log or a url.
 */
export const workspaceSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1),
  /** §20.6: the value an update must carry back for optimistic locking. */
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});

export type Workspace = z.infer<typeof workspaceSchema>;

/**
 * Wrapped in an object rather than returned as a bare array, so cursor pagination
 * (§21) can be added without changing the shape every caller already parses.
 */
export const workspaceListSchema = z.strictObject({
  workspaces: z.array(workspaceSchema),
});

export type WorkspaceList = z.infer<typeof workspaceListSchema>;
