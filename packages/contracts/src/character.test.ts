import { describe, expect, it } from "vitest";
import {
  CHARACTER_APPEARANCE_MAX_LENGTH,
  CHARACTER_NAME_MAX_LENGTH,
  CHARACTER_REFERENCE_IMAGE_MAX_COUNT,
  characterCreateInputSchema,
  characterListSchema,
  characterSchema,
  characterVersionCreateInputSchema,
  characterVersionListSchema,
} from "./character.js";

/**
 * The Character contract (`docs/ai-comic-drama-saas-design.md` §20.2, §32.7).
 *
 * One definition, read by the api that writes it, the repository that stores it and the
 * form that submits it (`docs/implementation-plan.md` §2).
 */

const ASSET_ID = "6d0b2f19-3a5c-4e8e-9b2a-71f0c4d5e6a7";
const OTHER_ASSET_ID = "8a1c4e57-2b6d-4f91-83c5-04e7b2a1d9f3";

const referenceImage = {
  assetId: ASSET_ID,
  contentType: "image/png",
  url: "https://storage.test/source/w/a?signature=abc",
  expiresAt: "2026-07-30T09:15:00.000Z",
};

const character = {
  id: "0f1a0f3a-6c4d-4f77-9c0b-1a2b3c4d5e6f",
  name: "Ada",
  revision: 1,
  createdAt: "2026-07-30T09:00:00.000Z",
  currentVersion: {
    version: 1,
    appearance: "Mid twenties, cropped black hair, round glasses, oversized grey coat.",
    referenceImages: [referenceImage],
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

  it("carries each reference image with permission to read it", () => {
    // §26 forbids a permanent public address for private material, so the url is signed
    // and short lived. `expiresAt` travels with it rather than being discovered when an
    // image stops loading.
    const parsed = characterSchema.parse(character);

    expect(parsed.currentVersion.referenceImages).toEqual([referenceImage]);
  });

  it("refuses a storage key in place of a signed url", () => {
    expect(
      characterSchema.safeParse({
        ...character,
        currentVersion: {
          ...character.currentVersion,
          referenceImages: [{ ...referenceImage, storageKey: "source/w/a" }],
        },
      }).success,
    ).toBe(false);
  });

  it("requires the reference image list to be present, even when empty", () => {
    // Absent and empty would otherwise mean the same thing to a renderer, and the api
    // always knows which it is.
    const { referenceImages: _images, ...withoutImages } = character.currentVersion;

    expect(characterSchema.safeParse({ ...character, currentVersion: withoutImages }).success).toBe(
      false,
    );
    expect(
      characterSchema.safeParse({
        ...character,
        currentVersion: { ...character.currentVersion, referenceImages: [] },
      }).success,
    ).toBe(true);
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
    expect(characterCreateInputSchema.parse(input)).toEqual({ ...input, referenceAssetIds: [] });
  });

  it("takes assets that were uploaded and confirmed beforehand", () => {
    // That order is forced: a version row is never rewritten (§32.7), so an image cannot
    // be attached to one after it exists.
    expect(
      characterCreateInputSchema.parse({ ...input, referenceAssetIds: [ASSET_ID] })
        .referenceAssetIds,
    ).toEqual([ASSET_ID]);
  });

  it("defaults to no images, which is a normal way to start a character", () => {
    expect(characterCreateInputSchema.parse(input).referenceAssetIds).toEqual([]);
  });

  it("refuses more images than a cast list can afford to render", () => {
    const tooMany = Array.from(
      { length: CHARACTER_REFERENCE_IMAGE_MAX_COUNT + 1 },
      (_unused, index) => `6d0b2f19-3a5c-4e8e-9b2a-71f0c4d5e6${index.toString().padStart(2, "0")}`,
    );

    expect(
      characterCreateInputSchema.safeParse({ ...input, referenceAssetIds: tooMany }).success,
    ).toBe(false);
  });

  it("refuses the same image twice", () => {
    // A client that lost track of its own list; collapsing the duplicate would hide that.
    expect(
      characterCreateInputSchema.safeParse({
        ...input,
        referenceAssetIds: [ASSET_ID, ASSET_ID],
      }).success,
    ).toBe(false);
    expect(
      characterCreateInputSchema.safeParse({
        ...input,
        referenceAssetIds: [ASSET_ID, OTHER_ASSET_ID],
      }).success,
    ).toBe(true);
  });

  it("trims both fields before checking length", () => {
    expect(
      characterCreateInputSchema.parse({ name: "  Ada  ", appearance: "  Round glasses.  " }),
    ).toEqual({ name: "Ada", appearance: "Round glasses.", referenceAssetIds: [] });
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

describe("character version create input", () => {
  const input = { appearance: "Now with a shaved head.", revision: 2 };

  it("carries the new appearance and the revision the caller read", () => {
    expect(characterVersionCreateInputSchema.parse(input)).toEqual({
      ...input,
      referenceAssetIds: [],
    });
  });

  it("states the new version's images in full rather than as a change to the last one", () => {
    /*
     * A version is a snapshot, so omitting the field means this version has no images —
     * not that it keeps the previous version's. That is why an edit form has to carry the
     * existing ones forward, and why this is worth pinning: the alternative reading would
     * make an appearance edit silently discard a creator's uploads.
     */
    expect(characterVersionCreateInputSchema.parse(input).referenceAssetIds).toEqual([]);
    expect(
      characterVersionCreateInputSchema.parse({ ...input, referenceAssetIds: [ASSET_ID] })
        .referenceAssetIds,
    ).toEqual([ASSET_ID]);
  });

  it("refuses one with no revision to check against", () => {
    // §20.6: without it, the new version lands on top of a change nobody saw, and the
    // person who made the earlier one never finds out.
    const { revision: _revision, ...withoutRevision } = input;

    expect(characterVersionCreateInputSchema.safeParse(withoutRevision).success).toBe(false);
  });

  it("holds the appearance to the same rules as the first version's", () => {
    expect(
      characterVersionCreateInputSchema.parse({ ...input, appearance: "  Trimmed.  " }).appearance,
    ).toBe("Trimmed.");
    expect(
      characterVersionCreateInputSchema.safeParse({ ...input, appearance: "   " }).success,
    ).toBe(false);
    expect(
      characterVersionCreateInputSchema.safeParse({
        ...input,
        appearance: "A".repeat(CHARACTER_APPEARANCE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("lists versions under a key, leaving room for a pagination cursor", () => {
    const version = {
      version: 1,
      appearance: "As first written.",
      referenceImages: [],
      createdAt: "2026-07-30T09:00:00.000Z",
    };

    expect(characterVersionListSchema.parse({ versions: [version] })).toEqual({
      versions: [version],
    });
  });
});
