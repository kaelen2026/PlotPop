import { describe, expect, it } from "vitest";
import { type AttemptRecord, attemptRecordSchema } from "../records/attempt.js";
import { projectEpisodeCostUsd, summarizeRun } from "./economics.js";

const sha = "c".repeat(64);

type AttemptSketch = {
  shotId: string;
  attemptNumber?: number;
  outcome?: AttemptRecord["outcome"];
  failureClass?: FailureClassName;
  costUsd?: number;
  reportedByProvider?: boolean;
  generateMs?: number;
  outputSeconds?: number;
};

type FailureClassName = "network" | "rate_limited" | "moderation_rejected" | "invalid_input";

const dispositions: Record<FailureClassName, AttemptRecord["failure"] & object> = {
  network: {
    failureClass: "network",
    retryDisposition: "retry_with_backoff",
    providerCode: null,
    providerMessage: null,
  },
  rate_limited: {
    failureClass: "rate_limited",
    retryDisposition: "retry_with_backoff",
    providerCode: null,
    providerMessage: null,
  },
  moderation_rejected: {
    failureClass: "moderation_rejected",
    retryDisposition: "do_not_retry",
    providerCode: null,
    providerMessage: null,
  },
  invalid_input: {
    failureClass: "invalid_input",
    retryDisposition: "do_not_retry",
    providerCode: null,
    providerMessage: null,
  },
};

/**
 * Fixed, hand-built attempts. Nothing here touches a provider: these are the
 * numbers the maths is checked against, chosen so every figure can be verified by
 * hand in the assertion.
 */
function attempt(sketch: AttemptSketch): AttemptRecord {
  const outcome = sketch.outcome ?? "succeeded";
  const generateMs = sketch.generateMs ?? 10_000;
  const outputSeconds = sketch.outputSeconds ?? 5;
  const costUsd = sketch.costUsd ?? 0.5;

  return attemptRecordSchema.parse({
    schemaVersion: 1,
    runId: "run-a",
    attemptId: `${sketch.shotId}-${sketch.attemptNumber ?? 1}`,
    idempotencyKey: `run-a:generate_shot_video:${sketch.shotId}:${sketch.attemptNumber ?? 1}`,
    shotId: sketch.shotId,
    tier: "standard",
    attemptNumber: sketch.attemptNumber ?? 1,
    provider: { id: "example-video", model: "example-video/v1", taskId: null },
    input: {
      renderedPrompt: "Rain falls.",
      promptSha256: sha,
      referenceImagePaths: [],
      parameters: {},
    },
    requestedAt: "2026-07-29T18:00:00.000Z",
    completedAt: "2026-07-29T18:05:00.000Z",
    latencyMs: { submit: 0, generate: generateMs, total: generateMs },
    outcome,
    failure: outcome === "failed" ? dispositions[sketch.failureClass ?? "network"] : null,
    usage:
      costUsd > 0
        ? {
            unit: "output_second",
            quantity: costUsd,
            unitPriceUsd: 1,
            costUsd,
            reportedByProvider: sketch.reportedByProvider ?? true,
          }
        : null,
    output:
      outcome === "succeeded"
        ? {
            path: `${sketch.shotId}.mp4`,
            bytes: 1000,
            sha256: sha,
            media: {
              container: "mp4",
              videoCodec: "h264",
              width: 1280,
              height: 720,
              frameRate: 24,
              durationSeconds: outputSeconds,
              bitrateBps: null,
              pixelFormat: null,
              frameCount: null,
              audio: null,
            },
            tierDrift: [],
          }
        : null,
  });
}

const plannedShotIds = ["shot-01", "shot-02", "shot-03", "shot-04"];

describe("run rollup", () => {
  it("reports nothing measured for a run that has not started", () => {
    const report = summarizeRun([], plannedShotIds);

    expect(report).toMatchObject({
      plannedShotCount: 4,
      attemptedShotCount: 0,
      attemptCount: 0,
      firstPassShotCount: 0,
      firstPassRate: 0,
      generateLatencyMs: null,
      acceptedOutputSeconds: 0,
    });
    expect(report.unresolvedShotIds).toEqual(plannedShotIds);
    expect(report.costUsd.perAcceptedMinute).toBeNull();
  });

  it("counts a first-pass shot only when its first attempt succeeded", () => {
    const records = [
      attempt({ shotId: "shot-01" }),
      attempt({ shotId: "shot-02", attemptNumber: 1, outcome: "failed" }),
      attempt({ shotId: "shot-02", attemptNumber: 2 }),
    ];

    const report = summarizeRun(records, plannedShotIds);

    expect(report.firstPassShotCount).toBe(1);
    expect(report.attemptedShotCount).toBe(2);
  });

  it("divides the first-pass rate by the whole test set, not by what was attempted", () => {
    // Otherwise a run that stopped after two good shots reports 100%.
    const report = summarizeRun([attempt({ shotId: "shot-01" })], plannedShotIds);

    expect(report.firstPassRate).toBe(0.25);
  });

  it("lists shots that never reached a usable version, which is what Gate B counts", () => {
    const records = [
      attempt({ shotId: "shot-01" }),
      attempt({ shotId: "shot-02", outcome: "failed" }),
    ];

    expect(summarizeRun(records, plannedShotIds).unresolvedShotIds).toEqual([
      "shot-02",
      "shot-03",
      "shot-04",
    ]);
  });

  it("counts every attempt a resolved shot needed, including the ones that failed", () => {
    const records = [
      attempt({ shotId: "shot-01", attemptNumber: 1, outcome: "failed" }),
      attempt({ shotId: "shot-01", attemptNumber: 2, outcome: "failed" }),
      attempt({ shotId: "shot-01", attemptNumber: 3 }),
      attempt({ shotId: "shot-02" }),
    ];

    expect(summarizeRun(records, plannedShotIds).attemptsPerResolvedShot).toMatchObject({
      count: 2,
      min: 1,
      max: 3,
    });
  });

  it("bills failed attempts into the total, because providers do", () => {
    const records = [
      attempt({ shotId: "shot-01", attemptNumber: 1, outcome: "failed", costUsd: 0.2 }),
      attempt({ shotId: "shot-01", attemptNumber: 2, costUsd: 0.5 }),
    ];

    const report = summarizeRun(records, plannedShotIds);

    expect(report.costUsd.total).toBeCloseTo(0.7, 6);
    expect(report.costUsd.onFailedAttempts).toBeCloseTo(0.2, 6);
  });

  it("charges a resolved shot for every attempt it took", () => {
    const records = [
      attempt({ shotId: "shot-01", attemptNumber: 1, outcome: "failed", costUsd: 0.2 }),
      attempt({ shotId: "shot-01", attemptNumber: 2, costUsd: 0.5 }),
      attempt({ shotId: "shot-02", costUsd: 0.5 }),
    ];

    const report = summarizeRun(records, plannedShotIds);

    expect(report.costUsd.perResolvedShot?.max).toBeCloseTo(0.7, 6);
    expect(report.costUsd.perResolvedShot?.min).toBeCloseTo(0.5, 6);
  });

  it("prices a finished minute against accepted footage, not against everything rendered", () => {
    const records = [
      attempt({ shotId: "shot-01", attemptNumber: 1, outcome: "failed", costUsd: 0.5 }),
      attempt({ shotId: "shot-01", attemptNumber: 2, costUsd: 0.5, outputSeconds: 6 }),
      attempt({ shotId: "shot-02", costUsd: 0.5, outputSeconds: 6 }),
    ];

    const report = summarizeRun(records, plannedShotIds);

    // 1.5 USD over 12 accepted seconds is 7.50 per finished minute.
    expect(report.acceptedOutputSeconds).toBe(12);
    expect(report.costUsd.perAcceptedMinute).toBeCloseTo(7.5, 6);
  });

  it("counts only the accepted version of a shot that succeeded twice", () => {
    // A retry after a success is a candidate version, not extra runtime.
    const records = [
      attempt({ shotId: "shot-01", attemptNumber: 1, outputSeconds: 5 }),
      attempt({ shotId: "shot-01", attemptNumber: 2, outputSeconds: 5 }),
    ];

    expect(summarizeRun(records, plannedShotIds).acceptedOutputSeconds).toBe(5);
  });

  it("summarises generation latency per attempt and wall clock per shot separately", () => {
    const records = [
      attempt({ shotId: "shot-01", attemptNumber: 1, outcome: "failed", generateMs: 10_000 }),
      attempt({ shotId: "shot-01", attemptNumber: 2, generateMs: 20_000 }),
    ];

    const report = summarizeRun(records, plannedShotIds);

    expect(report.generateLatencyMs).toMatchObject({ count: 2, min: 10_000, max: 20_000 });
    expect(report.shotWallClockMs).toMatchObject({ count: 1, total: 30_000 });
  });

  it("says how much of the billing it heard from the provider rather than derived", () => {
    const records = [
      attempt({ shotId: "shot-01", reportedByProvider: true }),
      attempt({ shotId: "shot-02", reportedByProvider: false }),
    ];

    expect(summarizeRun(records, plannedShotIds).usageCoverage).toEqual({
      attemptsWithUsage: 2,
      attemptsWithProviderReportedUsage: 1,
    });
  });

  it("tallies failures by class, so §7's remedy table can be applied", () => {
    const records = [
      attempt({ shotId: "shot-01", outcome: "failed", failureClass: "rate_limited" }),
      attempt({
        shotId: "shot-02",
        outcome: "failed",
        failureClass: "moderation_rejected",
      }),
      attempt({
        shotId: "shot-03",
        outcome: "failed",
        failureClass: "moderation_rejected",
      }),
    ];

    expect(summarizeRun(records, plannedShotIds).failureCounts).toEqual({
      rate_limited: 1,
      moderation_rejected: 2,
    });
  });

  it("refuses a record from a shot the test set does not contain", () => {
    expect(() => summarizeRun([attempt({ shotId: "shot-99" })], plannedShotIds)).toThrow(/shot-99/);
  });
});

describe("the Gate A economic re-check", () => {
  it("multiplies shot cost by 1/p, the COGS multiplier §6 names", () => {
    // 0.50 per shot at a 75% first-pass rate over 80 shots: 0.50 x 1.333 x 80.
    expect(
      projectEpisodeCostUsd({ costPerShotUsd: 0.5, firstPassRate: 0.75, shotsPerEpisode: 80 }),
    ).toBeCloseTo(53.333_333, 5);
  });

  it("costs nothing extra when every shot passes first time", () => {
    expect(
      projectEpisodeCostUsd({ costPerShotUsd: 0.5, firstPassRate: 1, shotsPerEpisode: 80 }),
    ).toBeCloseTo(40, 6);
  });

  it("refuses a first-pass rate of zero instead of returning infinity", () => {
    expect(() =>
      projectEpisodeCostUsd({ costPerShotUsd: 0.5, firstPassRate: 0, shotsPerEpisode: 80 }),
    ).toThrow(/first-pass rate/i);
  });
});
