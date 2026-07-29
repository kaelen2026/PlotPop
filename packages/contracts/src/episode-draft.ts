import { z } from "zod";

/**
 * The input the script step of the creation wizard collects
 * (`docs/ai-comic-drama-saas-design.md` §7.1: the user pastes or uploads an
 * English script, and the system extracts characters, locations, lines, actions
 * and scene boundaries from it).
 *
 * This is a cross service contract rather than a form detail: it is the shape the
 * API accepts once F-05 turns a script into scenes, so defining it anywhere else
 * would guarantee a second hand written copy on the server.
 *
 * No user facing messages live here. §14 keeps copy in the localisation resource,
 * so the form maps issue paths and codes onto its own text and the default Zod
 * messages are never displayed.
 */

export const EPISODE_TITLE_MAX_LENGTH = 120;

/**
 * A 5 to 10 minute episode cannot be parsed out of a sentence. The floor is low
 * enough for a short test script and high enough to reject a placeholder; F-05
 * can raise it once real parses show what is workable.
 */
export const EPISODE_SCRIPT_MIN_LENGTH = 200;

export const EPISODE_SCRIPT_MAX_LENGTH = 50_000;

export const episodeDraftInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(EPISODE_TITLE_MAX_LENGTH),
  script: z.string().trim().min(EPISODE_SCRIPT_MIN_LENGTH).max(EPISODE_SCRIPT_MAX_LENGTH),
});

export type EpisodeDraftInput = z.infer<typeof episodeDraftInputSchema>;
