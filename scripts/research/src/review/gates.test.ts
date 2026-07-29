import { describe, expect, it } from "vitest";
import { midnightNoodleRun } from "../testset/midnight-noodle-run.js";
import { evaluateGates, type GateInput } from "./gates.js";
import type { ReviewMapping } from "./packet.js";
import type { SequenceScore, ShotScore } from "./scores.js";

const raters = ["rater-1", "rater-2", "rater-3"];
const allShotIds = midnightNoodleRun.shots.map((shot) => shot.id);

const failedDiagnostics = {
  characterIdentity: 2,
  wardrobe: 3,
  artStyle: 4,
  sceneContinuity: 3,
  motionUsability: 3,
};

function mappingFor(
  entries: readonly { shotId: string; attemptNumber: number }[],
): ReviewMapping[] {
  return entries.map((entry, index) => ({
    code: `sample-${String(index + 1).padStart(2, "0")}`,
    shotId: entry.shotId,
    attemptNumber: entry.attemptNumber,
    tier: "standard",
    providerId: "example-video",
    sourcePath: `${entry.shotId}-${entry.attemptNumber}.mp4`,
  }));
}

function score(code: string, raterId: string, publishable: boolean): ShotScore {
  return {
    code,
    raterId,
    publishable,
    diagnostics: publishable ? null : failedDiagnostics,
    notes: "",
  };
}

/** Everybody agrees with `passed`, on every sample. */
function unanimous(
  mapping: readonly ReviewMapping[],
  passed: (entry: ReviewMapping) => boolean,
): ShotScore[] {
  return mapping.flatMap((entry) =>
    raters.map((raterId) => score(entry.code, raterId, passed(entry))),
  );
}

function sequenceScores(willing: readonly boolean[]): SequenceScore[] {
  return willing.map((willingToPublish, index) => ({
    raterId: raters[index] ?? `rater-${index + 1}`,
    willingToPublish,
    notes: "",
  }));
}

/** A run where every shot passed on its first try — the easy pass. */
function perfectRun(): GateInput {
  const mapping = mappingFor(allShotIds.map((shotId) => ({ shotId, attemptNumber: 1 })));

  return {
    series: midnightNoodleRun,
    mapping,
    shotScores: unanimous(mapping, () => true),
    sequenceScores: sequenceScores([true, true, true]),
  };
}

function gate(input: GateInput, name: "A" | "B" | "C" | "D") {
  const found = evaluateGates(input).gates.find((outcome) => outcome.gate === name);
  if (!found) throw new Error(`no Gate ${name} in the report`);

  return found;
}

describe("the four gates", () => {
  it("passes a run where every shot shipped on its first try", () => {
    const report = evaluateGates(perfectRun());

    expect(report.verdict).toBe("passed");
    expect(report.gates.every((outcome) => outcome.passed)).toBe(true);
    expect(report.firstPassShotIds).toHaveLength(30);
  });

  it("counts a sample as passing when two of three raters say yes", () => {
    // §3.1: at least two thirds, so a 2-1 split is a pass and a 1-2 split is not.
    const input = perfectRun();
    const split = input.mapping.flatMap((entry, index) =>
      raters.map((raterId, raterIndex) =>
        score(entry.code, raterId, !(index === 0 && raterIndex === 0)),
      ),
    );

    expect(evaluateGates({ ...input, shotScores: split }).firstPassShotIds).toHaveLength(30);
  });

  it("counts a sample as failing when two of three raters say no", () => {
    const input = perfectRun();
    const split = input.mapping.flatMap((entry, index) =>
      raters.map((raterId, raterIndex) =>
        score(entry.code, raterId, !(index === 0 && raterIndex < 2)),
      ),
    );

    expect(evaluateGates({ ...input, shotScores: split }).firstPassShotIds).toHaveLength(29);
  });
});

describe("Gate A: first-pass rate", () => {
  it("passes at exactly 23 of 30", () => {
    const failing = new Set(allShotIds.slice(0, 7));
    const mapping = mappingFor([
      ...allShotIds.map((shotId) => ({ shotId, attemptNumber: 1 })),
      // The seven failures are all fixed on a second go, so B and C stay clean.
      ...[...failing].map((shotId) => ({ shotId, attemptNumber: 2 })),
    ]);

    const report = evaluateGates({
      series: midnightNoodleRun,
      mapping,
      shotScores: unanimous(
        mapping,
        (entry) => !(entry.attemptNumber === 1 && failing.has(entry.shotId)),
      ),
      sequenceScores: sequenceScores([true, true, true]),
    });

    expect(gateOf(report, "A")).toMatchObject({ passed: true });
    expect(report.firstPassShotIds).toHaveLength(23);
  });

  it("fails at 22 of 30", () => {
    const failing = new Set(allShotIds.slice(0, 8));
    const mapping = mappingFor([
      ...allShotIds.map((shotId) => ({ shotId, attemptNumber: 1 })),
      ...[...failing].map((shotId) => ({ shotId, attemptNumber: 2 })),
    ]);

    const report = evaluateGates({
      series: midnightNoodleRun,
      mapping,
      shotScores: unanimous(
        mapping,
        (entry) => !(entry.attemptNumber === 1 && failing.has(entry.shotId)),
      ),
      sequenceScores: sequenceScores([true, true, true]),
    });

    expect(gateOf(report, "A")).toMatchObject({ passed: false });
    expect(report.verdict).toBe("failed");
  });
});

function gateOf(report: ReturnType<typeof evaluateGates>, name: "A" | "B" | "C" | "D") {
  const found = report.gates.find((outcome) => outcome.gate === name);
  if (!found) throw new Error(`no Gate ${name}`);

  return found;
}

describe("Gate B: nothing left unusable", () => {
  it("fails when a shot never reached a publishable version", () => {
    const mapping = mappingFor([
      ...allShotIds.map((shotId) => ({ shotId, attemptNumber: 1 })),
      ...[2, 3, 4].map((attemptNumber) => ({ shotId: "shot-05", attemptNumber })),
    ]);

    const input: GateInput = {
      series: midnightNoodleRun,
      mapping,
      shotScores: unanimous(mapping, (entry) => entry.shotId !== "shot-05"),
      sequenceScores: sequenceScores([true, true, true]),
    };

    expect(gate(input, "B")).toMatchObject({ passed: false });
    expect(evaluateGates(input).unresolvedShotIds).toEqual(["shot-05"]);
  });

  it("fails when a shot was never reviewed at all", () => {
    // A shot that produced no reviewable file is not "not yet measured"; it is a
    // shot with no usable version.
    const mapping = mappingFor(
      allShotIds.slice(0, 29).map((shotId) => ({ shotId, attemptNumber: 1 })),
    );

    const input: GateInput = {
      series: midnightNoodleRun,
      mapping,
      shotScores: unanimous(mapping, () => true),
      sequenceScores: sequenceScores([true, true, true]),
    };

    expect(gate(input, "B")).toMatchObject({ passed: false });
    expect(evaluateGates(input).unresolvedShotIds).toEqual(["shot-30"]);
  });

  it("passes when a shot needed three redos but got there", () => {
    const mapping = mappingFor([
      ...allShotIds.map((shotId) => ({ shotId, attemptNumber: 1 })),
      ...[2, 3, 4].map((attemptNumber) => ({ shotId: "shot-05", attemptNumber })),
    ]);

    const input: GateInput = {
      series: midnightNoodleRun,
      mapping,
      shotScores: unanimous(
        mapping,
        (entry) => entry.shotId !== "shot-05" || entry.attemptNumber === 4,
      ),
      sequenceScores: sequenceScores([true, true, true]),
    };

    expect(gate(input, "B")).toMatchObject({ passed: true });
  });
});

describe("Gate C: failures must not cluster", () => {
  function runWithFirstFailures(failingShotIds: readonly string[]): GateInput {
    const failing = new Set(failingShotIds);
    const mapping = mappingFor([
      ...allShotIds.map((shotId) => ({ shotId, attemptNumber: 1 })),
      ...failingShotIds.map((shotId) => ({ shotId, attemptNumber: 2 })),
    ]);

    return {
      series: midnightNoodleRun,
      mapping,
      shotScores: unanimous(
        mapping,
        (entry) => !(entry.attemptNumber === 1 && failing.has(entry.shotId)),
      ),
      sequenceScores: sequenceScores([true, true, true]),
    };
  }

  it("tolerates two failures side by side, which chance alone produces", () => {
    expect(gate(runWithFirstFailures(["shot-03", "shot-04"]), "C")).toMatchObject({ passed: true });
  });

  it("fails on three consecutive first-try failures", () => {
    // Three in a row interrupts an exchange, which is the §32.3 narrative risk.
    expect(gate(runWithFirstFailures(["shot-03", "shot-04", "shot-05"]), "C")).toMatchObject({
      passed: false,
    });
  });

  it("reads consecutive by shot rank, not by the order the log happens to hold", () => {
    const input = runWithFirstFailures(["shot-05", "shot-03", "shot-04"]);

    expect(gate(input, "C")).toMatchObject({ passed: false });
  });

  it("tolerates exactly half a scene failing", () => {
    // The market alley holds ten shots, so five is the boundary §4 allows.
    expect(
      gate(runWithFirstFailures(["shot-01", "shot-03", "shot-05", "shot-07", "shot-09"]), "C"),
    ).toMatchObject({ passed: true });
  });

  it("fails when more than half a scene failed on the first try", () => {
    expect(
      gate(
        runWithFirstFailures(["shot-01", "shot-03", "shot-05", "shot-07", "shot-09", "shot-02"]),
        "C",
      ),
    ).toMatchObject({ passed: false });
  });
});

describe("Gate D: the sequence", () => {
  it("passes when two of three raters would publish the stretch", () => {
    const input = { ...perfectRun(), sequenceScores: sequenceScores([true, true, false]) };

    expect(gate(input, "D")).toMatchObject({ passed: true });
  });

  it("fails when two of three would not", () => {
    const input = { ...perfectRun(), sequenceScores: sequenceScores([true, false, false]) };

    expect(gate(input, "D")).toMatchObject({ passed: false });
    expect(evaluateGates(input).verdict).toBe("failed");
  });

  it("fails when nobody was asked, rather than passing by default", () => {
    const input = { ...perfectRun(), sequenceScores: [] };

    expect(gate(input, "D")).toMatchObject({ passed: false });
  });
});

describe("scorecard calibration", () => {
  it("refuses to report a verdict when raters disagree on more than a fifth of samples", () => {
    // §5: past 20% pairwise disagreement, "publishable" does not mean the same
    // thing to three people, and no pass rate computed from it is worth anything.
    const input = perfectRun();
    const scores = input.mapping.flatMap((entry, index) => [
      score(entry.code, "rater-1", true),
      score(entry.code, "rater-2", index % 3 !== 0),
      score(entry.code, "rater-3", true),
    ]);

    const report = evaluateGates({ ...input, shotScores: scores });

    expect(report.verdict).toBe("invalid_scorecard");
    expect(report.worstPairwiseDisagreement).toBeGreaterThan(0.2);
  });

  it("does not take the majority vote when calibration failed", () => {
    const input = perfectRun();
    const scores = input.mapping.flatMap((entry, index) => [
      score(entry.code, "rater-1", true),
      score(entry.code, "rater-2", index % 3 !== 0),
      score(entry.code, "rater-3", true),
    ]);

    expect(evaluateGates({ ...input, shotScores: scores }).gates).toEqual([]);
  });

  it("accepts a scorecard where raters differ on a fifth of samples", () => {
    const input = perfectRun();
    const scores = input.mapping.flatMap((entry, index) => [
      score(entry.code, "rater-1", true),
      score(entry.code, "rater-2", index >= 6),
      score(entry.code, "rater-3", true),
    ]);

    const report = evaluateGates({ ...input, shotScores: scores });

    expect(report.worstPairwiseDisagreement).toBeCloseTo(0.2, 6);
    expect(report.verdict).toBe("passed");
  });

  it("refuses a run scored by fewer than three raters", () => {
    const input = perfectRun();
    const scores = input.shotScores.filter((entry) => entry.raterId !== "rater-3");

    const report = evaluateGates({
      ...input,
      shotScores: scores,
      sequenceScores: sequenceScores([true, true]),
    });

    expect(report.verdict).toBe("invalid_scorecard");
    expect(report.raterCount).toBe(2);
  });
});

describe("scorecard integrity", () => {
  it("refuses a score for a code the packet never issued", () => {
    const input = perfectRun();

    expect(() =>
      evaluateGates({
        ...input,
        shotScores: [...input.shotScores, score("sample-99", "rater-1", true)],
      }),
    ).toThrow(/sample-99/);
  });

  it("refuses two scores for the same sample from the same rater", () => {
    const input = perfectRun();
    const duplicate = input.shotScores[0];
    if (!duplicate) throw new Error("fixture");

    expect(() => evaluateGates({ ...input, shotScores: [...input.shotScores, duplicate] })).toThrow(
      /twice/i,
    );
  });

  it("refuses a sample that only some raters scored", () => {
    const input = perfectRun();
    const first = input.mapping[0];
    if (!first) throw new Error("fixture");

    expect(() =>
      evaluateGates({
        ...input,
        shotScores: input.shotScores.filter(
          (entry) => !(entry.code === first.code && entry.raterId === "rater-3"),
        ),
      }),
    ).toThrow(/rater-3/);
  });
});
