import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  missingCoverage,
  type shotSchema,
  shotsOfScene,
  testSeriesSchema,
  testSetSchemaVersion,
  totalPlannedSeconds,
} from "./schema.js";

type ShotInput = z.input<typeof shotSchema>;
type SeriesInput = z.input<typeof testSeriesSchema>;

function character(id: string) {
  return {
    id,
    versionId: `${id}-v1`,
    name: id,
    appearance: { face: "oval", hair: "short", eyes: "brown", build: "slight" },
    wardrobe: "grey coat",
    references: [
      { view: "front" as const, path: `${id}/front.png` },
      { view: "back" as const, path: `${id}/back.png` },
    ],
    voice: { locale: "en-US", timbre: "warm" },
  };
}

function scene(id: string) {
  return {
    id,
    name: id,
    location: "an alley",
    timeOfDay: "night" as const,
    lighting: "neon",
    setDressing: ["puddles"],
  };
}

/**
 * A minimum-size valid set: two characters, three scenes, twenty shots that cover
 * all five required kinds. Every rejection test starts here and breaks one rule,
 * so a failure names the rule rather than the fixture.
 */
function validSeries(overrides: Partial<SeriesInput> = {}): SeriesInput {
  const shots: ShotInput[] = Array.from({ length: 20 }, (_, index) => ({
    id: `shot-${String(index + 1).padStart(2, "0")}`,
    sceneId: `scene-${(index % 3) + 1}`,
    rank: (index + 1) * 100,
    framing: index === 0 ? "wide" : index === 1 ? "close_up" : "medium",
    beat: index === 2 ? "action" : index === 3 ? "dialogue" : "reaction",
    cameraMotion: "static",
    characterIds: index === 3 ? ["rio", "mika"] : ["rio"],
    durationSeconds: 5,
    action: "someone moves",
    ...(index === 3 ? { dialogue: [{ characterId: "rio", line: "hello" }] } : {}),
  }));

  return {
    schemaVersion: testSetSchemaVersion,
    id: "test-series",
    title: "Test Series",
    frozenOn: "2026-07-29",
    styleGuide: {
      id: "pop-anime",
      name: "Pop Anime",
      lineWork: "bold ink",
      coloring: "flat cel",
      rendering: "hard shadows",
      palette: ["#000000"],
    },
    characters: [character("rio"), character("mika")],
    scenes: [scene("scene-1"), scene("scene-2"), scene("scene-3")],
    shots,
    ...overrides,
  };
}

function shotsWith(mutate: (shots: ShotInput[]) => void): SeriesInput {
  const series = validSeries();
  mutate(series.shots as ShotInput[]);
  return series;
}

describe("test series schema", () => {
  it("accepts a set that satisfies every §5.2 constraint", () => {
    const parsed = testSeriesSchema.parse(validSeries());

    expect(parsed.shots).toHaveLength(20);
    expect(parsed.shots[0]?.dialogue).toEqual([]);
  });

  it("rejects a set with fewer than two characters", () => {
    const series = validSeries({ characters: [character("rio")] });

    expect(testSeriesSchema.safeParse(series).success).toBe(false);
  });

  it("rejects a set with more than four characters", () => {
    const series = validSeries({
      characters: ["rio", "mika", "hale", "juno", "pax"].map(character),
    });

    expect(testSeriesSchema.safeParse(series).success).toBe(false);
  });

  it("rejects a set that does not have exactly three scenes", () => {
    const series = validSeries({ scenes: [scene("scene-1"), scene("scene-2")] });

    expect(testSeriesSchema.safeParse(series).success).toBe(false);
  });

  it("rejects fewer than twenty shots", () => {
    const series = validSeries();
    series.shots = (series.shots as ShotInput[]).slice(0, 19);

    expect(testSeriesSchema.safeParse(series).success).toBe(false);
  });

  it("rejects more than thirty shots", () => {
    const series = validSeries();
    const shots = series.shots as ShotInput[];
    series.shots = [
      ...shots,
      ...Array.from({ length: 11 }, (_, index) => ({
        ...(shots[0] as ShotInput),
        id: `extra-${index}`,
        rank: 10_000 + index,
      })),
    ];

    expect(testSeriesSchema.safeParse(series).success).toBe(false);
  });

  it("rejects a shot whose duration leaves the three-to-eight-second window", () => {
    for (const durationSeconds of [2.9, 8.1]) {
      const series = shotsWith((shots) => {
        const shot = shots[0];
        if (shot) shot.durationSeconds = durationSeconds;
      });

      expect(testSeriesSchema.safeParse(series).success).toBe(false);
    }
  });

  it("rejects a shot that points at a scene the set does not define", () => {
    const series = shotsWith((shots) => {
      const shot = shots[0];
      if (shot) shot.sceneId = "scene-99";
    });

    const result = testSeriesSchema.safeParse(series);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("unknown scene scene-99");
  });

  it("rejects a shot that casts a character the series does not define", () => {
    const series = shotsWith((shots) => {
      const shot = shots[0];
      if (shot) shot.characterIds = ["stranger"];
    });

    const result = testSeriesSchema.safeParse(series);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("unknown character stranger");
  });

  it("rejects duplicate shot ids", () => {
    const series = shotsWith((shots) => {
      const [first, second] = shots;
      if (first && second) second.id = first.id;
    });

    const result = testSeriesSchema.safeParse(series);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("duplicate shots ids");
  });

  it("rejects shot ranks that do not ascend, because Gate C counts consecutive shots", () => {
    const series = shotsWith((shots) => {
      const [first, second] = shots;
      if (first && second) second.rank = first.rank;
    });

    const result = testSeriesSchema.safeParse(series);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("strictly ascending");
  });

  it("rejects a dialogue line spoken by a character who is not in frame", () => {
    const series = shotsWith((shots) => {
      // Rio keeps the line; only Mika stays in frame.
      const shot = shots[3];
      if (shot) shot.characterIds = ["mika"];
    });

    const result = testSeriesSchema.safeParse(series);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("rio speaks in shot-04");
    expect(result.error?.issues[0]?.message).toContain("is not in frame");
  });

  it("rejects a set that covers no multi-character shot", () => {
    const series = shotsWith((shots) => {
      for (const shot of shots) shot.characterIds = ["rio"];
      const speaking = shots[3];
      if (speaking) speaking.dialogue = [{ characterId: "rio", line: "hello" }];
    });

    const result = testSeriesSchema.safeParse(series);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("multi_character");
  });

  it("rejects a set with no wide shot", () => {
    const series = shotsWith((shots) => {
      const shot = shots[0];
      if (shot) shot.framing = "medium";
    });

    const result = testSeriesSchema.safeParse(series);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("wide");
  });

  it("rejects unknown fields so a renamed key cannot be silently ignored", () => {
    const series = { ...validSeries(), note: "extra" };

    expect(testSeriesSchema.safeParse(series).success).toBe(false);
  });
});

describe("coverage reporting", () => {
  it("names every kind the shot list fails to cover", () => {
    const shots = testSeriesSchema.parse(validSeries()).shots.map((shot) => ({
      ...shot,
      framing: "medium" as const,
      beat: "reaction" as const,
      characterIds: ["rio"],
      dialogue: [],
    }));

    expect(missingCoverage(shots)).toEqual([
      "close_up",
      "wide",
      "dialogue",
      "action",
      "multi_character",
    ]);
  });
});

describe("test set derivations", () => {
  it("groups shots by scene in rank order", () => {
    const series = testSeriesSchema.parse(validSeries());
    const scene1 = shotsOfScene(series, "scene-1");

    expect(scene1.map((shot) => shot.id)).toEqual([
      "shot-01",
      "shot-04",
      "shot-07",
      "shot-10",
      "shot-13",
      "shot-16",
      "shot-19",
    ]);
  });

  it("sums planned runtime, the denominator of every per-minute figure", () => {
    expect(totalPlannedSeconds(testSeriesSchema.parse(validSeries()))).toBe(100);
  });
});
