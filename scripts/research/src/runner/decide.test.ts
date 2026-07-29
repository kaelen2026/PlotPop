import { describe, expect, it } from "vitest";
import type { FailureClass } from "../failures.js";
import { retryDispositionOf } from "../failures.js";
import { type AttemptRecord, attemptRecordSchema } from "../records/attempt.js";
import { type DecisionInput, decideShotAction } from "./decide.js";

const sha = "d".repeat(64);

function attempt(options: {
  shotId?: string;
  attemptNumber: number;
  outcome: AttemptRecord["outcome"];
  failureClass?: FailureClass;
}): AttemptRecord {
  const shotId = options.shotId ?? "shot-01";
  const failureClass = options.failureClass ?? "network";

  return attemptRecordSchema.parse({
    schemaVersion: 1,
    runId: "run-a",
    attemptId: `${shotId}-${options.attemptNumber}`,
    idempotencyKey: `run-a:generate_shot_video:${shotId}:${options.attemptNumber}`,
    shotId,
    tier: "standard",
    attemptNumber: options.attemptNumber,
    provider: { id: "example-video", model: "example-video/v1", taskId: null },
    input: {
      renderedPrompt: "Rain falls.",
      promptSha256: sha,
      referenceImagePaths: [],
      parameters: {},
    },
    requestedAt: "2026-07-29T18:00:00.000Z",
    completedAt: "2026-07-29T18:01:00.000Z",
    latencyMs: { submit: 0, generate: 1000, total: 1000 },
    outcome: options.outcome,
    failure:
      options.outcome === "failed"
        ? {
            failureClass,
            retryDisposition: retryDispositionOf(failureClass),
            providerCode: null,
            providerMessage: null,
          }
        : null,
    usage: null,
    output:
      options.outcome === "succeeded"
        ? {
            path: `${shotId}.mp4`,
            bytes: 1000,
            sha256: sha,
            media: {
              container: "mp4",
              videoCodec: "h264",
              width: 1280,
              height: 720,
              frameRate: 24,
              durationSeconds: 5,
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

function decide(overrides: Partial<DecisionInput> = {}) {
  return decideShotAction({
    shotId: "shot-01",
    attempts: [],
    maxAttemptsPerShot: 4,
    spentUsd: 0,
    spendCapUsd: 40,
    estimatedNextCostUsd: 0.5,
    ...overrides,
  });
}

describe("what to do with a shot", () => {
  it("generates the first attempt for a shot nothing has been tried on", () => {
    expect(decide()).toEqual({ action: "generate", attemptNumber: 1 });
  });

  it("continues the numbering after a failure", () => {
    expect(decide({ attempts: [attempt({ attemptNumber: 1, outcome: "failed" })] })).toEqual({
      action: "generate",
      attemptNumber: 2,
    });
  });

  it("skips a shot that already has a usable version", () => {
    expect(decide({ attempts: [attempt({ attemptNumber: 1, outcome: "succeeded" })] })).toEqual({
      action: "skip",
      reason: "already_usable",
    });
  });

  it("stops the run before the spend cap is crossed, not after", () => {
    // A cap you notice on the way out is a receipt, not a cap.
    expect(decide({ spentUsd: 39.75, estimatedNextCostUsd: 0.5 })).toEqual({
      action: "stop",
      reason: "spend_cap_reached",
    });
  });

  it("allows an attempt that lands exactly on the cap", () => {
    expect(decide({ spentUsd: 39.5, estimatedNextCostUsd: 0.5 })).toEqual({
      action: "generate",
      attemptNumber: 1,
    });
  });

  it("never stops an offline run, which has no cap because it has no cost", () => {
    expect(decide({ spendCapUsd: null, spentUsd: 1_000_000 })).toEqual({
      action: "generate",
      attemptNumber: 1,
    });
  });

  it("does not stop the run over a shot it was going to skip anyway", () => {
    expect(
      decide({
        attempts: [attempt({ attemptNumber: 1, outcome: "succeeded" })],
        spentUsd: 39.99,
      }),
    ).toEqual({ action: "skip", reason: "already_usable" });
  });

  it("stops trying once Gate B's budget of four attempts is used up", () => {
    const attempts = [1, 2, 3, 4].map((attemptNumber) =>
      attempt({ attemptNumber, outcome: "failed" }),
    );

    expect(decide({ attempts })).toEqual({
      action: "skip",
      reason: "attempt_budget_exhausted",
    });
  });

  it("stops after a moderation rejection even with budget left", () => {
    // Retrying a content-policy rejection spends the rest of the budget on a
    // request that cannot succeed.
    expect(
      decide({
        attempts: [
          attempt({ attemptNumber: 1, outcome: "failed", failureClass: "moderation_rejected" }),
        ],
      }),
    ).toEqual({ action: "skip", reason: "not_retryable" });
  });

  it("stops after invalid input, which no amount of retrying fixes", () => {
    expect(
      decide({
        attempts: [attempt({ attemptNumber: 1, outcome: "failed", failureClass: "invalid_input" })],
      }),
    ).toEqual({ action: "skip", reason: "not_retryable" });
  });

  it("hands a timed-out attempt to a human instead of resubmitting it", () => {
    // The provider may already be rendering it, and already billing for it.
    expect(
      decide({
        attempts: [attempt({ attemptNumber: 1, outcome: "failed", failureClass: "timeout" })],
      }),
    ).toEqual({ action: "skip", reason: "needs_manual_reconciliation" });
  });

  it("retries a rate limit, which is the whole reason backoff exists", () => {
    expect(
      decide({
        attempts: [attempt({ attemptNumber: 1, outcome: "failed", failureClass: "rate_limited" })],
      }),
    ).toEqual({ action: "generate", attemptNumber: 2 });
  });

  it("retries after an attempt we cancelled ourselves", () => {
    expect(decide({ attempts: [attempt({ attemptNumber: 1, outcome: "cancelled" })] })).toEqual({
      action: "generate",
      attemptNumber: 2,
    });
  });

  it("judges the newest failure, not the oldest", () => {
    const attempts = [
      attempt({ attemptNumber: 1, outcome: "failed", failureClass: "network" }),
      attempt({ attemptNumber: 2, outcome: "failed", failureClass: "moderation_rejected" }),
    ];

    expect(decide({ attempts })).toEqual({ action: "skip", reason: "not_retryable" });
  });

  it("ignores attempts that belong to other shots", () => {
    const attempts = [1, 2, 3, 4].map((attemptNumber) =>
      attempt({ shotId: "shot-02", attemptNumber, outcome: "failed" }),
    );

    expect(decide({ shotId: "shot-01", attempts })).toEqual({
      action: "generate",
      attemptNumber: 1,
    });
  });
});
