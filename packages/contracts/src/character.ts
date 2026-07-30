import { z } from "zod";

/**
 * A Character, and the version of it that is current
 * (`docs/ai-comic-drama-saas-design.md` §20.2, §32.7).
 *
 * The split is the whole point. A Character is the identity that stays put across
 * episodes; a Character Version is what it looked like at a moment, and an episode or
 * a shot locks the version it used. Without the split, improving a character's
 * appearance would silently change every episode that already shipped with it — which
 * §32.7 names as the risk this shape exists to control.
 *
 * Reference images, clothing and voice configuration are part of a version too (§32.1)
 * and arrive with the slices that give a creator somewhere to set them. The appearance
 * description is here because it is the one a character cannot be generated without.
 */

export const CHARACTER_NAME_MAX_LENGTH = 80;

/**
 * `docs/research/consistency-gate.md` measures whether a description holds a character
 * together across 20 to 30 shots. Until it has, the floor is only "not blank": a
 * minimum invented here would be a number nobody has tested, blocking people for no
 * reason. F-00's results are what should raise it.
 */
export const CHARACTER_APPEARANCE_MAX_LENGTH = 2_000;

const characterNameSchema = z.string().trim().min(1).max(CHARACTER_NAME_MAX_LENGTH);
const characterAppearanceSchema = z.string().trim().min(1).max(CHARACTER_APPEARANCE_MAX_LENGTH);

export const characterVersionSchema = z.strictObject({
  /** Counts from 1 within one character, so a creator can refer to "version 2". */
  version: z.number().int().positive(),
  appearance: z.string().min(1),
  createdAt: z.iso.datetime(),
});

export type CharacterVersion = z.infer<typeof characterVersionSchema>;

export const characterSchema = z.strictObject({
  id: z.uuid(),
  name: characterNameSchema,
  /** §20.6: the value an update must carry back for optimistic locking. */
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  /**
   * The version a new episode would use. Nested rather than flattened, so a payload
   * cannot read as though a character has one appearance for all time.
   */
  currentVersion: characterVersionSchema,
});

export type Character = z.infer<typeof characterSchema>;

/**
 * Wrapped in an object rather than returned as a bare array, so the cursor pagination
 * §21 requires can be added without changing the shape every caller already parses.
 */
export const characterListSchema = z.strictObject({
  characters: z.array(characterSchema),
});

export type CharacterList = z.infer<typeof characterListSchema>;

/**
 * What creating a character asks for: an identity and the first version of it.
 *
 * Both at once, because a character with no version has no appearance and cannot be
 * generated — it would be a row that looks like progress and produces nothing.
 */
export const characterCreateInputSchema = z.strictObject({
  name: characterNameSchema,
  appearance: characterAppearanceSchema,
});

export type CharacterCreateInput = z.infer<typeof characterCreateInputSchema>;
