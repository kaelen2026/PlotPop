import { z } from "zod";

/**
 * A Series: the creative identity reused across episodes
 * (`docs/ai-comic-drama-saas-design.md` §6.1 — characters, voices, the visual
 * style guide and the default generation settings all hang off it).
 *
 * Only the name is here. The rest of §6.1 arrives with the slices that give a
 * creator somewhere to edit it, and a column no page can write is a column whose
 * meaning is decided by whoever gets there first.
 *
 * The owning workspace is deliberately absent from the payload: a caller who can
 * read a series is a member of the workspace it belongs to and learns nothing from
 * its identifier, while an identifier in a payload is one more thing that ends up
 * in a log or a url (the same reasoning as `workspaceSchema`).
 */

export const SERIES_NAME_MAX_LENGTH = 120;

/**
 * Stated once, because creating and renaming a series have to agree on what a name
 * is: two definitions would be two answers to "is this too long".
 */
const seriesNameSchema = z.string().trim().min(1).max(SERIES_NAME_MAX_LENGTH);

export const seriesSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1),
  /** §20.6: the value an update must carry back for optimistic locking. */
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});

export type Series = z.infer<typeof seriesSchema>;

/**
 * Wrapped in an object rather than returned as a bare array, so the cursor
 * pagination §21 requires can be added without changing the shape every caller
 * already parses.
 */
export const seriesListSchema = z.strictObject({
  series: z.array(seriesSchema),
});

export type SeriesList = z.infer<typeof seriesListSchema>;

/**
 * What creating a series asks for. No user facing messages live here: §14 keeps
 * copy in the localisation resources, so a form maps issue paths onto its own text
 * and Zod's default messages are never displayed.
 */
export const seriesCreateInputSchema = z.strictObject({
  name: seriesNameSchema,
});

export type SeriesCreateInput = z.infer<typeof seriesCreateInputSchema>;

/**
 * Renaming carries the revision the caller read (§20.6).
 *
 * It is required rather than optional on purpose: an update without one is an update
 * that silently overwrites whatever someone else did in the meantime, and a client
 * that cannot supply it has not read the series it is trying to rename.
 */
export const seriesRenameInputSchema = z.strictObject({
  name: seriesNameSchema,
  revision: seriesSchema.shape.revision,
});

export type SeriesRenameInput = z.infer<typeof seriesRenameInputSchema>;
