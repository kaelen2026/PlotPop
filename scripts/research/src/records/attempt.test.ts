import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  attemptIdempotencyKey,
  attemptRecordSchema,
  attemptRecordSchemaVersion,
  redactSecrets,
} from "./attempt.js";

type RecordInput = z.input<typeof attemptRecordSchema>;

const sha = "a".repeat(64);

const media = {
  container: "mov,mp4,m4a,3gp,3g2,mj2",
  videoCodec: "h264",
  width: 1280,
  height: 720,
  frameRate: 24,
  durationSeconds: 5,
  bitrateBps: 1_500_000,
  pixelFormat: "yuv420p",
  frameCount: 120,
  audio: null,
};

function succeeded(overrides: Partial<RecordInput> = {}): RecordInput {
  return {
    schemaVersion: attemptRecordSchemaVersion,
    runId: "run-2026-07-29a",
    attemptId: "01J0000000000000000000000A",
    idempotencyKey: attemptIdempotencyKey({
      runId: "run-2026-07-29a",
      operation: "generate_shot_video",
      shotId: "shot-01",
      attemptNumber: 1,
    }),
    shotId: "shot-01",
    tier: "standard",
    attemptNumber: 1,
    provider: { id: "example-video", model: "example-video/v1", taskId: "task-123" },
    input: {
      renderedPrompt: "Rain falls through the signage glow.",
      promptSha256: sha,
      referenceImagePaths: ["characters/rio-alvarez/front.png"],
      parameters: { width: 1280, height: 720, duration: 5 },
    },
    requestedAt: "2026-07-29T18:00:00.000Z",
    completedAt: "2026-07-29T18:01:12.000Z",
    latencyMs: { submit: 800, generate: 71_200, total: 72_000 },
    outcome: "succeeded",
    failure: null,
    usage: {
      unit: "output_second",
      quantity: 5,
      unitPriceUsd: 0.1,
      costUsd: 0.5,
      reportedByProvider: true,
    },
    output: {
      path: "shots/shot-01/attempt-1.mp4",
      bytes: 940_000,
      sha256: sha,
      media,
      tierDrift: [],
    },
    ...overrides,
  };
}

function failed(overrides: Partial<RecordInput> = {}): RecordInput {
  return succeeded({
    outcome: "failed",
    failure: {
      failureClass: "moderation_rejected",
      retryDisposition: "do_not_retry",
      providerCode: "content_policy_violation",
      providerMessage: "input rejected",
    },
    usage: null,
    output: null,
    ...overrides,
  });
}

describe("attempt idempotency key", () => {
  it("is built from run, operation, target and version, the shape ADR-008 fixes", () => {
    expect(
      attemptIdempotencyKey({
        runId: "run-a",
        operation: "generate_shot_video",
        shotId: "shot-07",
        attemptNumber: 3,
      }),
    ).toBe("run-a:generate_shot_video:shot-07:3");
  });

  it("separates two attempts at the same shot", () => {
    const parts = { runId: "run-a", operation: "generate_shot_video", shotId: "shot-07" };

    expect(attemptIdempotencyKey({ ...parts, attemptNumber: 1 })).not.toBe(
      attemptIdempotencyKey({ ...parts, attemptNumber: 2 }),
    );
  });
});

describe("attempt record", () => {
  it("accepts a successful generation", () => {
    const parsed = attemptRecordSchema.parse(succeeded());

    expect(parsed.output?.media.frameRate).toBe(24);
  });

  it("accepts a failure with no output", () => {
    expect(attemptRecordSchema.safeParse(failed()).success).toBe(true);
  });

  it("refuses a success with no output, because a passed shot with no file is a bug", () => {
    const result = attemptRecordSchema.safeParse(succeeded({ output: null }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/output/i);
  });

  it("refuses a success that also carries a failure", () => {
    expect(
      attemptRecordSchema.safeParse(
        succeeded({
          failure: {
            failureClass: "network",
            retryDisposition: "retry_with_backoff",
            providerCode: null,
            providerMessage: null,
          },
        }),
      ).success,
    ).toBe(false);
  });

  it("refuses a failure with no failure class, so an unexplained failure cannot be logged", () => {
    expect(attemptRecordSchema.safeParse(failed({ failure: null })).success).toBe(false);
  });

  it("refuses a disposition that contradicts the failure class", () => {
    // Nothing may quietly mark a moderation rejection as retryable.
    const result = attemptRecordSchema.safeParse(
      failed({
        failure: {
          failureClass: "moderation_rejected",
          retryDisposition: "retry_with_backoff",
          providerCode: null,
          providerMessage: null,
        },
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/do_not_retry/);
  });

  it("refuses a cost that does not follow from quantity and unit price", () => {
    const result = attemptRecordSchema.safeParse(
      succeeded({
        usage: {
          unit: "output_second",
          quantity: 5,
          unitPriceUsd: 0.1,
          costUsd: 0.05,
          reportedByProvider: true,
        },
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/cost/i);
  });

  it("accepts a cost that rounds cleanly at six decimals", () => {
    expect(
      attemptRecordSchema.safeParse(
        succeeded({
          usage: {
            unit: "output_second",
            quantity: 5.021,
            unitPriceUsd: 0.075,
            costUsd: 0.376575,
            reportedByProvider: false,
          },
        }),
      ).success,
    ).toBe(true);
  });

  it("refuses a total latency smaller than its own parts", () => {
    expect(
      attemptRecordSchema.safeParse(
        succeeded({ latencyMs: { submit: 800, generate: 71_200, total: 1000 } }),
      ).success,
    ).toBe(false);
  });

  it("refuses a completion earlier than the request", () => {
    expect(
      attemptRecordSchema.safeParse(succeeded({ completedAt: "2026-07-29T17:00:00.000Z" })).success,
    ).toBe(false);
  });

  it("refuses an unknown field, so a renamed key cannot vanish from the record", () => {
    expect(attemptRecordSchema.safeParse({ ...succeeded(), note: "extra" }).success).toBe(false);
  });

  it("survives a round trip through jsonl", () => {
    const parsed = attemptRecordSchema.parse(succeeded());
    const roundTripped = attemptRecordSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(roundTripped).toEqual(parsed);
  });
});

describe("secret redaction", () => {
  const secrets = ["sk-live-abcdef123456"];

  it("replaces a credential wherever it appears in the request", () => {
    const redacted = redactSecrets(
      { headers: { Authorization: "Bearer sk-live-abcdef123456" }, model: "v1" },
      secrets,
    );

    expect(JSON.stringify(redacted)).not.toContain("sk-live-abcdef123456");
    expect(redacted).toEqual({ headers: { Authorization: "[redacted]" }, model: "v1" });
  });

  it("masks credential-shaped keys even when the value is one we were not told about", () => {
    expect(redactSecrets({ api_key: "unknown-token", apiKey: "another", model: "v1" }, [])).toEqual(
      {
        api_key: "[redacted]",
        apiKey: "[redacted]",
        model: "v1",
      },
    );
  });

  it("walks arrays and nested objects", () => {
    expect(redactSecrets({ items: [{ token: "x" }, { prompt: "keep me" }] }, secrets)).toEqual({
      items: [{ token: "[redacted]" }, { prompt: "keep me" }],
    });
  });

  it("leaves the prompt and the parameters that explain the cost alone", () => {
    const parameters = { width: 1280, height: 720, duration: 5, prompt: "Rain falls." };

    expect(redactSecrets(parameters, secrets)).toEqual(parameters);
  });

  it("ignores an empty secret, which would otherwise redact every string", () => {
    expect(redactSecrets({ model: "v1" }, [""])).toEqual({ model: "v1" });
  });
});
