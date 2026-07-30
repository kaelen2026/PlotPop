import { z } from "zod";
import { assetReferenceSchema, assetSchema } from "./asset.js";

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

/**
 * §32.1 keeps a character's front and back reference images alongside its description.
 * Four is room for both plus two supplements — a bound so that one character cannot make
 * a cast list arbitrarily expensive to render, not a creative judgement.
 */
export const CHARACTER_REFERENCE_IMAGE_MAX_COUNT = 4;

/**
 * The assets a version pins, in the order they were given.
 *
 * Duplicates are refused rather than collapsed: sending the same image twice is a client
 * that lost track of its own list, and quietly storing one of them hides that.
 */
const referenceAssetIdsSchema = z
  .array(assetSchema.shape.id)
  .max(CHARACTER_REFERENCE_IMAGE_MAX_COUNT)
  .refine((ids) => new Set(ids).size === ids.length)
  .default([]);

export const characterVersionSchema = z.strictObject({
  /** Counts from 1 within one character, so a creator can refer to "version 2". */
  version: z.number().int().positive(),
  appearance: z.string().min(1),
  /**
   * What this version looked like, as files. Pinned to the version rather than to the
   * character for the same reason the appearance is (§32.7): an episode generated from
   * version 2 has to keep finding version 2's images, not whatever was uploaded later.
   */
  referenceImages: z.array(assetReferenceSchema),
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
  /**
   * Assets uploaded and confirmed beforehand (§26), referenced by id.
   *
   * It has to be this way round: a version row is never rewritten, so an image cannot be
   * attached to one after the fact. Defaults to none, because a character described only
   * in words is a normal starting point.
   */
  referenceAssetIds: referenceAssetIdsSchema,
});

export type CharacterCreateInput = z.infer<typeof characterCreateInputSchema>;

/**
 * Adding a version to a character (§32.7).
 *
 * A creation rather than an edit: versions are append-only, because an episode that
 * already generated with version 2 has to keep finding version 2. Nothing here ever
 * rewrites one.
 *
 * The revision is the character's, and it is required for the same reason renaming a
 * series requires one (§20.6): the appearance being replaced is the one the caller read,
 * and without the check they would be adding a version on top of a change they never saw.
 */
export const characterVersionCreateInputSchema = z.strictObject({
  appearance: characterAppearanceSchema,
  revision: characterSchema.shape.revision,
  /**
   * What the new version pins, stated in full rather than as a change to the last one.
   *
   * A version is a snapshot, so omitting this means the new version has no reference
   * images — not that it keeps the previous ones. A form editing an appearance therefore
   * has to carry the existing images forward, and `character-row.tsx` does.
   */
  referenceAssetIds: referenceAssetIdsSchema,
});

export type CharacterVersionCreateInput = z.infer<typeof characterVersionCreateInputSchema>;

/**
 * A character's versions, newest first: the history §32.7 keeps so that a creator can see
 * what an older episode was made with.
 */
export const characterVersionListSchema = z.strictObject({
  versions: z.array(characterVersionSchema),
});

export type CharacterVersionList = z.infer<typeof characterVersionListSchema>;
