import { z } from "zod";

/**
 * The unified task status from `docs/ai-comic-drama-saas-design.md` §11.
 *
 * All three services touch it — the API writes it, the Worker advances it, the
 * Web renders it — so it is a cross service contract rather than a UI concern.
 * `docs/design-system.md` §12.4 binds each value to a label, an icon and a
 * semantic colour, and forbids a page from inventing either.
 *
 * The order is the lifecycle order, which is what list groupings and status
 * filters read; it is not alphabetical and must not be sorted.
 */
export const GENERATION_STATUSES = [
  "draft",
  "queued",
  "generating",
  "needs_review",
  "completed",
  "failed",
] as const;

export const generationStatusSchema = z.enum(GENERATION_STATUSES);

export type GenerationStatus = z.infer<typeof generationStatusSchema>;
