import type { TestScene, TestSeries, TestShot } from "../testset/schema.js";

/**
 * Renders one shot into the request a video model receives.
 *
 * The whole point is that this is a **function of the frozen data**, not free
 * prompting. §32.1 requires character and style inputs to be fixed rather than
 * re-described each time, and a prompt that varied between attempts would make a
 * failed Gate A unattributable — nobody could tell character drift from a
 * differently worded request.
 *
 * Two things are deliberately left out:
 *
 * - Spoken lines. They drive the voice track; handing them to a video model
 *   mostly produces garbled lettering burnt into the frame. The prompt says who is
 *   speaking, not what they say.
 * - Anything about the provider. This produces a prompt and a list of reference
 *   paths; the adapter decides how its API wants them (ADR-005).
 */

export type RenderedShotRequest = {
  readonly prompt: string;
  readonly referenceImagePaths: readonly string[];
};

const framingWords = {
  close_up: "close-up",
  medium: "medium shot",
  wide: "wide shot",
} as const;

const cameraWords = {
  static: "locked-off camera, no movement",
  pan: "camera pans across the action",
  push_in: "camera pushes in slowly",
  pull_out: "camera pulls out slowly",
  handheld: "handheld camera, small natural shake",
  crane: "crane move, camera rises through the shot",
} as const;

function describeScene(scene: TestScene): string {
  return [
    `Setting: ${scene.name}. ${scene.location}.`,
    `Time of day: ${scene.timeOfDay}. Lighting: ${scene.lighting}.`,
    `In the set: ${scene.setDressing.join("; ")}.`,
  ].join(" ");
}

export function renderShotRequest(series: TestSeries, shot: TestShot): RenderedShotRequest {
  const scene = series.scenes.find((candidate) => candidate.id === shot.sceneId);
  if (!scene) throw new Error(`shot ${shot.id} names scene ${shot.sceneId}, which does not exist`);

  const cast = shot.characterIds.map((characterId) => {
    const character = series.characters.find((candidate) => candidate.id === characterId);
    if (!character) throw new Error(`shot ${shot.id} casts ${characterId}, who does not exist`);

    return character;
  });

  const speakers = [...new Set(shot.dialogue.map((line) => line.characterId))]
    .map((characterId) => cast.find((character) => character.id === characterId)?.name)
    .filter((name): name is string => name !== undefined);

  const sections = [
    `${framingWords[shot.framing]}, ${shot.durationSeconds} second shot for an animated comic drama series.`,
    `Action: ${shot.action}`,
    describeScene(scene),
    ...cast.map((character) =>
      [
        `Character in frame — ${character.name}:`,
        `face ${character.appearance.face};`,
        `hair ${character.appearance.hair};`,
        `eyes ${character.appearance.eyes};`,
        `build ${character.appearance.build}.`,
        `Wearing: ${character.wardrobe}.`,
      ].join(" "),
    ),
    speakers.length > 0
      ? `${speakers.join(" and ")} ${speakers.length > 1 ? "are" : "is"} speaking; mouth movement only, the line itself is not in the picture.`
      : "Nobody speaks in this shot.",
    `Camera: ${cameraWords[shot.cameraMotion]}.`,
    [
      `Art style — ${series.styleGuide.name}:`,
      `${series.styleGuide.lineWork}.`,
      `${series.styleGuide.coloring}.`,
      `${series.styleGuide.rendering}.`,
      `Palette: ${series.styleGuide.palette.join(", ")}.`,
    ].join(" "),
    series.styleGuide.avoid.length > 0 ? `Avoid: ${series.styleGuide.avoid.join("; ")}.` : "",
    // Every video model in reach spells badly, and lettering in frame is the one
    // artefact a human rater will always call unpublishable.
    "No on-screen text, captions, subtitles, watermarks or signage lettering.",
  ];

  return {
    prompt: sections.filter((section) => section.length > 0).join("\n"),
    referenceImagePaths: cast.flatMap((character) =>
      character.references.map((reference) => reference.path),
    ),
  };
}
