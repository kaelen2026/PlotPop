import { z } from "zod";

/**
 * Schemas for the frozen F-00 test set (`docs/implementation-plan.md` §5.2).
 *
 * The test set is data, not prose. `docs/research/consistency-gate.md` §2 fixes
 * it before the first generation and forbids swapping it afterwards, and every
 * gate is expressed as a ratio over its shots — so "30 shots covering close-ups,
 * wides, dialogue, action and multi-character framing" has to be something a
 * program can check, not something a reader has to take on trust.
 *
 * Zod is the single source of truth here as everywhere else: the types below are
 * all `z.infer`, never hand-written interfaces.
 */

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "expected a lower-case slug, e.g. rio-alvarez");

const sentence = z.string().min(1).max(400);

/** Bumped when the shape below changes, so an old run log stays readable. */
export const testSetSchemaVersion = 1;

/**
 * Reference images are the main lever §32.1 gives us against drift, so the view
 * each one shows is part of the data rather than a filename convention. Paths are
 * relative to the test-set directory: the harness resolves them, and nothing
 * absolute from one machine leaks into the frozen definition.
 */
export const referenceViewSchema = z.enum([
  "front",
  "three_quarter",
  "back",
  "expression_neutral",
  "expression_emotive",
]);

export type ReferenceView = z.infer<typeof referenceViewSchema>;

export const characterReferenceSchema = z.strictObject({
  view: referenceViewSchema,
  path: z.string().min(1),
});

export type CharacterReference = z.infer<typeof characterReferenceSchema>;

/**
 * Appearance is split into named traits instead of one paragraph because the
 * diagnostic dimensions in `consistency-gate.md` §3.2 score identity and wardrobe
 * separately. A rater who marks "wardrobe" as the failure needs a wardrobe field
 * to compare against.
 */
export const characterSchema = z.strictObject({
  id: slug,
  /** Locked per shot the way `Character` / `CharacterVersion` will be (§32.7). */
  versionId: slug,
  name: z.string().min(1),
  appearance: z.strictObject({
    face: sentence,
    hair: sentence,
    eyes: sentence,
    build: sentence,
  }),
  wardrobe: sentence,
  /** Front and back at minimum: §32.1 asks for both, so the schema asks too. */
  references: z.array(characterReferenceSchema).min(2),
  voice: z.strictObject({
    locale: z.string().min(2),
    timbre: sentence,
  }),
});

export type TestCharacter = z.infer<typeof characterSchema>;

export const sceneSchema = z.strictObject({
  id: slug,
  name: z.string().min(1),
  location: sentence,
  timeOfDay: z.enum(["dawn", "day", "dusk", "night"]),
  lighting: sentence,
  setDressing: z.array(sentence).min(1),
});

export type TestScene = z.infer<typeof sceneSchema>;

/** Close-up and wide are required coverage in §5.2; medium is the filler. */
export const framingSchema = z.enum(["close_up", "medium", "wide"]);

export type Framing = z.infer<typeof framingSchema>;

/** Dialogue and action are required coverage; the rest carry the sequence. */
export const beatSchema = z.enum(["establishing", "dialogue", "action", "reaction"]);

export type Beat = z.infer<typeof beatSchema>;

export const cameraMotionSchema = z.enum([
  "static",
  "pan",
  "push_in",
  "pull_out",
  "handheld",
  "crane",
]);

export type CameraMotion = z.infer<typeof cameraMotionSchema>;

export const dialogueLineSchema = z.strictObject({
  characterId: slug,
  line: sentence,
});

export type DialogueLine = z.infer<typeof dialogueLineSchema>;

/**
 * `durationSeconds` is bounded by the 3–8 second recommendation in §33, which
 * `consistency-gate.md` §8 also names as a re-freeze trigger: a test set outside
 * that window would measure a product we have not decided to build.
 *
 * `rank` is a sortable rank rather than an array index because Scene and Shot use
 * ranks in the product (§ data boundaries) and because Gate C asks about
 * *consecutive* shots — the order has to be an explicit, checkable property.
 */
export const shotSchema = z.strictObject({
  id: slug,
  sceneId: slug,
  rank: z.number().int().positive(),
  framing: framingSchema,
  beat: beatSchema,
  cameraMotion: cameraMotionSchema,
  characterIds: z.array(slug).max(4),
  durationSeconds: z.number().min(3).max(8),
  action: sentence,
  dialogue: z.array(dialogueLineSchema).default([]),
});

export type TestShot = z.infer<typeof shotSchema>;

/**
 * One style, described in the terms the style guide will use. MVP ships 1–3
 * verified styles (§33) and F-00 evaluates exactly one: mixing styles inside the
 * test set would make a failed Gate A unattributable.
 */
export const styleGuideSchema = z.strictObject({
  id: slug,
  name: z.string().min(1),
  lineWork: sentence,
  coloring: sentence,
  rendering: sentence,
  palette: z.array(z.string().min(1)).min(1),
  avoid: z.array(sentence).default([]),
});

export type StyleGuide = z.infer<typeof styleGuideSchema>;

const seriesShapeSchema = z.strictObject({
  schemaVersion: z.literal(testSetSchemaVersion),
  id: slug,
  title: z.string().min(1),
  /** ISO date the set was frozen. §2 forbids changing it after this. */
  frozenOn: z.iso.date(),
  styleGuide: styleGuideSchema,
  characters: z.array(characterSchema).min(2).max(4),
  scenes: z.array(sceneSchema).length(3),
  shots: z.array(shotSchema).min(20).max(30),
});

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }

  return [...repeated];
}

/**
 * The coverage §5.2 demands, restated as five predicates over the shot list.
 *
 * "Multi-character" is derived from `characterIds.length >= 2` rather than being a
 * `beat` of its own: a two-hander is a property of who is in frame, and the same
 * shot can be both a dialogue beat and a multi-character shot. Modelling it as a
 * separate enum member would have forced a false choice.
 */
export const coverageRequirements = {
  close_up: (shots: readonly TestShot[]) => shots.some((shot) => shot.framing === "close_up"),
  wide: (shots: readonly TestShot[]) => shots.some((shot) => shot.framing === "wide"),
  dialogue: (shots: readonly TestShot[]) => shots.some((shot) => shot.beat === "dialogue"),
  action: (shots: readonly TestShot[]) => shots.some((shot) => shot.beat === "action"),
  multi_character: (shots: readonly TestShot[]) =>
    shots.some((shot) => shot.characterIds.length >= 2),
} as const;

export type CoverageKind = keyof typeof coverageRequirements;

export function missingCoverage(shots: readonly TestShot[]): CoverageKind[] {
  return (Object.keys(coverageRequirements) as CoverageKind[]).filter(
    (kind) => !coverageRequirements[kind](shots),
  );
}

/**
 * Cross-field rules live here rather than in the leaf schemas because every one of
 * them is about the set as a whole. A shot pointing at a scene that does not
 * exist is not a malformed shot; it is a malformed test set.
 */
export const testSeriesSchema = seriesShapeSchema.superRefine((series, ctx) => {
  const characterIds = new Set(series.characters.map((character) => character.id));
  const sceneIds = new Set(series.scenes.map((scene) => scene.id));

  for (const [label, ids] of [
    ["characters", series.characters.map((character) => character.id)],
    ["scenes", series.scenes.map((scene) => scene.id)],
    ["shots", series.shots.map((shot) => shot.id)],
  ] as const) {
    const repeated = duplicates(ids);
    if (repeated.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: [label],
        message: `duplicate ${label} ids: ${repeated.join(", ")}`,
      });
    }
  }

  const ranks = series.shots.map((shot) => shot.rank);
  const ascending = ranks.every((rank, index) => index === 0 || rank > (ranks[index - 1] ?? 0));

  if (!ascending) {
    ctx.addIssue({
      code: "custom",
      path: ["shots"],
      message: "shot ranks must be unique and strictly ascending in list order",
    });
  }

  series.shots.forEach((shot, index) => {
    if (!sceneIds.has(shot.sceneId)) {
      ctx.addIssue({
        code: "custom",
        path: ["shots", index, "sceneId"],
        message: `unknown scene ${shot.sceneId}`,
      });
    }

    for (const characterId of shot.characterIds) {
      if (!characterIds.has(characterId)) {
        ctx.addIssue({
          code: "custom",
          path: ["shots", index, "characterIds"],
          message: `unknown character ${characterId}`,
        });
      }
    }

    shot.dialogue.forEach((line, lineIndex) => {
      if (!shot.characterIds.includes(line.characterId)) {
        ctx.addIssue({
          code: "custom",
          path: ["shots", index, "dialogue", lineIndex, "characterId"],
          message: `${line.characterId} speaks in ${shot.id} but is not in frame`,
        });
      }
    });
  });

  const missing = missingCoverage(series.shots);
  if (missing.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["shots"],
      message: `test set does not cover: ${missing.join(", ")}`,
    });
  }
});

export type TestSeries = z.infer<typeof testSeriesSchema>;

/** Shots of one scene in rank order — what Gate C's per-scene rule counts over. */
export function shotsOfScene(series: TestSeries, sceneId: string): TestShot[] {
  return series.shots.filter((shot) => shot.sceneId === sceneId);
}

/** Total runtime of the test set, the denominator of every per-minute figure. */
export function totalPlannedSeconds(series: TestSeries): number {
  return series.shots.reduce((total, shot) => total + shot.durationSeconds, 0);
}
