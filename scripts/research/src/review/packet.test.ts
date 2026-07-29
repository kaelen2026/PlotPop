import { describe, expect, it } from "vitest";
import { type AttemptRecord, attemptRecordSchema } from "../records/attempt.js";
import { buildReviewPacket } from "./packet.js";

const sha = "e".repeat(64);

function attempt(options: {
  shotId: string;
  attemptNumber: number;
  outcome?: AttemptRecord["outcome"];
}): AttemptRecord {
  const outcome = options.outcome ?? "succeeded";

  return attemptRecordSchema.parse({
    schemaVersion: 1,
    runId: "run-a",
    attemptId: `${options.shotId}-${options.attemptNumber}`,
    idempotencyKey: `run-a:generate_shot_video:${options.shotId}:${options.attemptNumber}`,
    shotId: options.shotId,
    tier: "pro",
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
    outcome,
    failure:
      outcome === "failed"
        ? {
            failureClass: "network",
            retryDisposition: "retry_with_backoff",
            providerCode: null,
            providerMessage: null,
          }
        : null,
    usage: null,
    output:
      outcome === "succeeded"
        ? {
            path: `shots/${options.shotId}/attempt-${options.attemptNumber}.mp4`,
            bytes: 1000,
            sha256: sha,
            media: {
              container: "mp4",
              videoCodec: "h264",
              width: 1920,
              height: 1080,
              frameRate: 30,
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

const shotOrder = ["shot-01", "shot-02", "shot-03", "shot-04"];

const records = [
  attempt({ shotId: "shot-01", attemptNumber: 1 }),
  attempt({ shotId: "shot-02", attemptNumber: 1, outcome: "failed" }),
  attempt({ shotId: "shot-02", attemptNumber: 2 }),
  attempt({ shotId: "shot-03", attemptNumber: 1 }),
  attempt({ shotId: "shot-03", attemptNumber: 2 }),
];

describe("the blind review packet", () => {
  it("issues one sample per attempt that produced a file", () => {
    // Redos are reviewed too, and reviewed blind, which is the only way Gate A's
    // first-try rate can be measured without telling the rater which is which.
    expect(buildReviewPacket(records, { seed: "run-a", shotOrder }).samples).toHaveLength(4);
  });

  it("issues no sample for an attempt that produced nothing", () => {
    const codes = buildReviewPacket(records, { seed: "run-a", shotOrder }).mapping;

    expect(codes.some((entry) => entry.shotId === "shot-02" && entry.attemptNumber === 1)).toBe(
      false,
    );
  });

  it("gives every sample a code that reveals nothing about it", () => {
    // §5 forbids telling the rater the tier, the provider, or which redo this is.
    for (const sample of buildReviewPacket(records, { seed: "run-a", shotOrder }).samples) {
      expect(sample.code).toMatch(/^sample-\d{2}$/);
      expect(sample.code).not.toContain("shot");
      expect(sample.code).not.toContain("pro");
      expect(sample.code).not.toContain("example");
    }
  });

  it("keeps codes unique", () => {
    const packet = buildReviewPacket(records, { seed: "run-a", shotOrder });

    expect(new Set(packet.samples.map((sample) => sample.code)).size).toBe(packet.samples.length);
  });

  it("maps every code back to exactly one attempt", () => {
    const packet = buildReviewPacket(records, { seed: "run-a", shotOrder });

    expect(packet.mapping).toHaveLength(packet.samples.length);
    for (const sample of packet.samples) {
      const entry = packet.mapping.find((candidate) => candidate.code === sample.code);
      expect(entry?.sourcePath).toBe(sample.sourcePath);
    }
  });

  it("rebuilds the same packet from the same seed, so a lost scorecard is recoverable", () => {
    expect(buildReviewPacket(records, { seed: "run-a", shotOrder }).mapping).toEqual(
      buildReviewPacket(records, { seed: "run-a", shotOrder }).mapping,
    );
  });

  it("does not present samples in shot order", () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      attempt({ shotId: `shot-${String(index + 1).padStart(2, "0")}`, attemptNumber: 1 }),
    );
    const packet = buildReviewPacket(many, {
      seed: "run-a",
      shotOrder: many.map((record) => record.shotId),
    });

    expect(packet.mapping.map((entry) => entry.shotId)).not.toEqual(
      many.map((record) => record.shotId),
    );
  });

  it("orders the Gate D sequence by the story, not by the shuffle", () => {
    // §4 asks whether the finished stretch works as part of an episode, which
    // cannot be asked of a shuffled pile.
    expect(
      buildReviewPacket(records, { seed: "run-a", shotOrder }).sequence.map(
        (entry) => entry.shotId,
      ),
    ).toEqual(["shot-01", "shot-02", "shot-03"]);
  });

  it("puts the earliest usable take in the sequence, matching what the cost rollup accepts", () => {
    const sequence = buildReviewPacket(records, { seed: "run-a", shotOrder }).sequence;

    expect(sequence.find((entry) => entry.shotId === "shot-03")?.sourcePath).toBe(
      "shots/shot-03/attempt-1.mp4",
    );
  });

  it("leaves a shot with no usable take out of the sequence rather than out of order", () => {
    expect(
      buildReviewPacket(records, { seed: "run-a", shotOrder }).sequence.some(
        (entry) => entry.shotId === "shot-04",
      ),
    ).toBe(false);
  });
});
