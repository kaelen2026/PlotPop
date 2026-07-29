import { describe, expect, it } from "vitest";
import { midnightNoodleRun } from "../testset/midnight-noodle-run.js";
import type { TestShot } from "../testset/schema.js";
import { renderShotRequest } from "./prompt.js";

function shot(id: string): TestShot {
  const found = midnightNoodleRun.shots.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`fixture has no ${id}`);

  return found;
}

describe("shot request rendering", () => {
  it("renders the same shot the same way every time", () => {
    // §32.1 asks for fixed character and style inputs rather than free prompting.
    // A prompt that varies between attempts would make a failed Gate A
    // unattributable: nobody could tell drift from a different request.
    expect(renderShotRequest(midnightNoodleRun, shot("shot-08"))).toEqual(
      renderShotRequest(midnightNoodleRun, shot("shot-08")),
    );
  });

  it("carries the style guide into every shot", () => {
    const { prompt } = renderShotRequest(midnightNoodleRun, shot("shot-01"));

    expect(prompt).toContain("Bold uniform ink outlines");
    expect(prompt).toContain("Flat cel shading");
  });

  it("carries what the style guide forbids", () => {
    expect(renderShotRequest(midnightNoodleRun, shot("shot-01")).prompt).toContain(
      "Photoreal skin texture",
    );
  });

  it("describes only the characters actually in frame", () => {
    const { prompt } = renderShotRequest(midnightNoodleRun, shot("shot-09"));

    expect(prompt).toContain("Hale Song");
    expect(prompt).not.toContain("Rio Alvarez");
    expect(prompt).not.toContain("Mika Tanaka-Reed");
  });

  it("spells out wardrobe and appearance rather than trusting the character's name", () => {
    const { prompt } = renderShotRequest(midnightNoodleRun, shot("shot-04"));

    expect(prompt).toContain("teal streak");
    expect(prompt).toContain("Orange bomber jacket");
  });

  it("carries the scene's location and lighting so backgrounds do not drift", () => {
    const { prompt } = renderShotRequest(midnightNoodleRun, shot("shot-01"));

    expect(prompt).toContain("Magenta and cyan signage");
    expect(prompt).toContain("Stacked plastic crates");
  });

  it("states the framing, the camera move and the length", () => {
    const { prompt } = renderShotRequest(midnightNoodleRun, shot("shot-06"));

    expect(prompt).toContain("wide shot");
    expect(prompt).toContain("crane");
    expect(prompt).toContain("6 second");
  });

  it("asks for no lettering, because a video model cannot spell", () => {
    expect(renderShotRequest(midnightNoodleRun, shot("shot-01")).prompt).toMatch(
      /no on-screen text/i,
    );
  });

  it("keeps spoken lines out of the visual prompt", () => {
    // The line drives the voice track, not the picture; feeding it to a video
    // model mostly produces garbled captions burnt into the frame.
    const { prompt } = renderShotRequest(midnightNoodleRun, shot("shot-15"));

    expect(prompt).not.toContain("You said eight bowls");
    expect(prompt).toContain("speaking");
  });

  it("passes the references of the characters in frame, and no others", () => {
    const { referenceImagePaths } = renderShotRequest(midnightNoodleRun, shot("shot-09"));

    expect(referenceImagePaths.every((path) => path.startsWith("characters/hale-song/"))).toBe(
      true,
    );
    expect(referenceImagePaths.length).toBeGreaterThan(0);
  });

  it("passes no references for a shot with nobody in it", () => {
    expect(renderShotRequest(midnightNoodleRun, shot("shot-22")).referenceImagePaths).toEqual([]);
  });

  it("renders every shot in the frozen set without throwing", () => {
    for (const candidate of midnightNoodleRun.shots) {
      expect(renderShotRequest(midnightNoodleRun, candidate).prompt.length).toBeGreaterThan(80);
    }
  });
});
