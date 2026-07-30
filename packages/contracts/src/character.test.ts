import { describe, expect, it } from "vitest";
import {
  CHARACTER_APPEARANCE_MAX_LENGTH,
  CHARACTER_NAME_MAX_LENGTH,
  characterCreateInputSchema,
  characterListSchema,
  characterSchema,
} from "./character.js";

/**
 * The Character contract (`docs/ai-comic-drama-saas-design.md` §20.2, §32.7).
 *
 * One definition, read by the api that writes it, the repository that stores it and the
 * form that submits it (`docs/implementation-plan.md` §2).
 */

const character = {
  id: "0f1a0f3a-6c4d-4f77-9c0b-1a2b3c4d5e6f",
  name: "Ada",
  revision: 1,
  createdAt: "2026-07-30T09:00:00.000Z",
  currentVersion: {
    version: 1,
    appearance: "Mid twenties, cropped black hair, round glasses, oversized grey coat.",
    createdAt: "2026-07-30T09:00:00.000Z",
  },
};

describe("character", () => {
  it("carries an identity and the version that is current", () => {
    expect(characterSchema.parse(character)).toEqual(character);
  });

  it("refuses a character with no version", () => {
    // §32.7 splits identity from appearance; a character without a version has no
    // appearance and cannot be generated, so it is not a character yet.
    const { currentVersion: _currentVersion, ...withoutVersion } = character;

    expect(characterSchema.safeParse(withoutVersion).success).toBe(false);
  });

  it("refuses a version number no row could hold", () => {
    expect(
      characterSchema.safeParse({
        ...character,
        currentVersion: { ...character.currentVersion, version: 0 },
      }).success,
    ).toBe(false);
  });

  it("refuses fields it does not describe", () => {
    // The owning series is not in the payload: a caller who can read a character
    // reached it through its series, so the identifier tells them nothing new.
    expect(characterSchema.safeParse({ ...character, seriesId: character.id }).success).toBe(false);
  });

  it("lists characters under a key, leaving room for a pagination cursor", () => {
    expect(characterListSchema.parse({ characters: [character] })).toEqual({
      characters: [character],
    });
    expect(characterListSchema.parse({ characters: [] })).toEqual({ characters: [] });
  });
});

describe("character create input", () => {
  const input = { name: "Ada", appearance: "Cropped black hair, round glasses." };

  it("asks for an identity and the first version of it at once", () => {
    expect(characterCreateInputSchema.parse(input)).toEqual(input);
  });

  it("trims both fields before checking length", () => {
    expect(
      characterCreateInputSchema.parse({ name: "  Ada  ", appearance: "  Round glasses.  " }),
    ).toEqual({ name: "Ada", appearance: "Round glasses." });
    expect(characterCreateInputSchema.safeParse({ ...input, name: "   " }).success).toBe(false);
    expect(characterCreateInputSchema.safeParse({ ...input, appearance: "   " }).success).toBe(
      false,
    );
  });

  it("requires an appearance, because a character without one generates nothing", () => {
    const { appearance: _appearance, ...withoutAppearance } = input;

    expect(characterCreateInputSchema.safeParse(withoutAppearance).success).toBe(false);
  });

  it("holds both fields to the documented lengths", () => {
    expect(
      characterCreateInputSchema.safeParse({
        ...input,
        name: "A".repeat(CHARACTER_NAME_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      characterCreateInputSchema.safeParse({
        ...input,
        name: "A".repeat(CHARACTER_NAME_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      characterCreateInputSchema.safeParse({
        ...input,
        appearance: "A".repeat(CHARACTER_APPEARANCE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});
