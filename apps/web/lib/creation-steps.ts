import { z } from "zod";

/**
 * The five step creation flow from `docs/ai-comic-drama-saas-design.md` §5.3:
 * script, cast, storyboard, animate, export.
 *
 * This stays in the Web app because it is the shape of one screen, not a service
 * boundary. It becomes a contract the day the step is part of the URL, which is
 * also the day a stale link can carry a value the app has to reject — hence the
 * schema rather than a bare union.
 */
export const creationStepSchema = z.enum(["script", "cast", "storyboard", "animate", "export"]);

export type CreationStep = z.infer<typeof creationStepSchema>;

export const CREATION_STEPS = creationStepSchema.options;
