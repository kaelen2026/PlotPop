import { describe, expect, it } from "vitest";
import { midnightNoodleRun } from "./midnight-noodle-run.js";
import { missingCoverage, shotsOfScene, totalPlannedSeconds } from "./schema.js";

/**
 * These are not tests of the fixture's taste. They are the check that the frozen
 * set still satisfies the constraints the gates are computed against — the run is
 * paid for, so a set that drifted out of spec has to fail here rather than after
 * thirty billed generations.
 */
describe("the frozen midnight-noodle-run test set", () => {
  it("holds thirty shots across three scenes with three characters", () => {
    expect(midnightNoodleRun.shots).toHaveLength(30);
    expect(midnightNoodleRun.scenes).toHaveLength(3);
    expect(midnightNoodleRun.characters).toHaveLength(3);
  });

  it("covers every framing and beat kind §5.2 requires", () => {
    expect(missingCoverage(midnightNoodleRun.shots)).toEqual([]);
  });

  it("keeps every shot inside the three-to-eight-second window", () => {
    for (const shot of midnightNoodleRun.shots) {
      expect(shot.durationSeconds).toBeGreaterThanOrEqual(3);
      expect(shot.durationSeconds).toBeLessThanOrEqual(8);
    }
  });

  it("spreads shots across all three scenes, so Gate C's per-scene rule has something to count", () => {
    const perScene = midnightNoodleRun.scenes.map(
      (scene) => shotsOfScene(midnightNoodleRun, scene.id).length,
    );

    expect(perScene).toEqual([10, 11, 9]);
  });

  it("runs long enough to judge as a stretch of an episode", () => {
    expect(totalPlannedSeconds(midnightNoodleRun)).toBe(141);
  });

  it("gives every character front and back references, the drift lever §32.1 relies on", () => {
    for (const character of midnightNoodleRun.characters) {
      const views = character.references.map((reference) => reference.view);

      expect(views).toContain("front");
      expect(views).toContain("back");
    }
  });

  it("evaluates exactly one visual style, so a failed Gate A stays attributable", () => {
    expect(midnightNoodleRun.styleGuide.id).toBe("pop-anime-neon");
  });
});
