import { z } from "zod";
import { failureClassSchema, retryDispositionOf, retryDispositionSchema } from "../failures.js";
import { mediaFactsSchema } from "../media/ffprobe.js";
import { qualityTierSchema, tierDriftSchema } from "../tiers.js";

/**
 * One generation attempt, as it is written to the run log.
 *
 * §5.2 asks the harness to save the input, output, latency, billable units, retry
 * count and failure type of every generation. This schema is that list, plus the
 * refusals that keep a run log worth trusting after the money is spent: a success
 * with no file, a failure with no reason, or a cost that does not follow from the
 * quantity and the unit price are all things you cannot detect later by reading.
 *
 * `reportedByProvider` on the usage is the field that keeps the unit economics
 * honest. A quantity the provider told us is evidence; a quantity we derived from
 * our own request is an assumption, and the report must be able to say which it
 * had.
 */

export const attemptRecordSchemaVersion = 1;

/** Six decimals: sub-cent unit prices are normal, float noise is not. */
const costPrecision = 1e6;

export const billableUsageSchema = z.strictObject({
  /** The provider's unit, normalised. Which one it is belongs in the record. */
  unit: z.enum(["output_second", "generated_frame", "request", "compute_second"]),
  quantity: z.number().positive(),
  unitPriceUsd: z.number().nonnegative(),
  costUsd: z.number().nonnegative(),
  reportedByProvider: z.boolean(),
});

export type BillableUsage = z.infer<typeof billableUsageSchema>;

const shapeSchema = z.strictObject({
  schemaVersion: z.literal(attemptRecordSchemaVersion),
  runId: z.string().min(1),
  attemptId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  shotId: z.string().min(1),
  tier: qualityTierSchema,
  /** 1 is the first generation; Gate B allows up to 3 more (§4). */
  attemptNumber: z.number().int().min(1),
  provider: z.strictObject({
    id: z.string().min(1),
    model: z.string().min(1),
    /**
     * The provider's own task id, kept as an external reference only. ADR-002 is
     * explicit that it never acts as a domain identifier.
     */
    taskId: z.string().min(1).nullable(),
  }),
  input: z.strictObject({
    renderedPrompt: z.string().min(1),
    /** Lets a report notice that "the same shot" was sent a different prompt. */
    promptSha256: z.string().regex(/^[0-9a-f]{64}$/),
    referenceImagePaths: z.array(z.string().min(1)),
    /** Provider-shaped, and passed through `redactSecrets` before it lands here. */
    parameters: z.record(z.string(), z.unknown()),
  }),
  requestedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  latencyMs: z.strictObject({
    /** Time to have the task accepted — separated because 429s show up here. */
    submit: z.number().int().nonnegative(),
    /** Queue plus render, which is the figure §34.1 asks for P50/P95 of. */
    generate: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  outcome: z.enum(["succeeded", "failed", "cancelled"]),
  failure: z
    .strictObject({
      failureClass: failureClassSchema,
      retryDisposition: retryDispositionSchema,
      providerCode: z.string().nullable(),
      providerMessage: z.string().nullable(),
    })
    .nullable(),
  /**
   * Null when nothing was billed. A failed attempt can still carry usage: some
   * providers bill for a render that then failed moderation, and pretending
   * otherwise is how a unit economics model ends up optimistic.
   */
  usage: billableUsageSchema.nullable(),
  output: z
    .strictObject({
      path: z.string().min(1),
      bytes: z.number().int().positive(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      media: mediaFactsSchema,
      tierDrift: z.array(tierDriftSchema),
    })
    .nullable(),
});

export const attemptRecordSchema = shapeSchema.superRefine((record, ctx) => {
  if (record.outcome === "succeeded" && record.output === null) {
    ctx.addIssue({
      code: "custom",
      path: ["output"],
      message: "a succeeded attempt must carry its output",
    });
  }

  if (record.outcome === "succeeded" && record.failure !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["failure"],
      message: "a succeeded attempt cannot also carry a failure",
    });
  }

  if (record.outcome === "failed" && record.failure === null) {
    ctx.addIssue({
      code: "custom",
      path: ["failure"],
      message: "a failed attempt must say why it failed",
    });
  }

  if (record.failure !== null) {
    const expected = retryDispositionOf(record.failure.failureClass);

    if (record.failure.retryDisposition !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["failure", "retryDisposition"],
        message: `${record.failure.failureClass} is ${expected}, not ${record.failure.retryDisposition}`,
      });
    }
  }

  if (record.usage !== null) {
    const derived =
      Math.round(record.usage.quantity * record.usage.unitPriceUsd * costPrecision) / costPrecision;

    if (Math.round(record.usage.costUsd * costPrecision) / costPrecision !== derived) {
      ctx.addIssue({
        code: "custom",
        path: ["usage", "costUsd"],
        message: `cost ${record.usage.costUsd} does not follow from ${record.usage.quantity} x ${record.usage.unitPriceUsd} (${derived})`,
      });
    }
  }

  if (record.latencyMs.total < record.latencyMs.submit + record.latencyMs.generate) {
    ctx.addIssue({
      code: "custom",
      path: ["latencyMs", "total"],
      message: "total latency cannot be smaller than submit plus generate",
    });
  }

  if (Date.parse(record.completedAt) < Date.parse(record.requestedAt)) {
    ctx.addIssue({
      code: "custom",
      path: ["completedAt"],
      message: "an attempt cannot complete before it was requested",
    });
  }
});

export type AttemptRecord = z.infer<typeof attemptRecordSchema>;

/**
 * `run + operation + target + version`, the task idempotency key CLAUDE.md fixes.
 *
 * F-00 does not have a queue that can double-deliver, but the harness resumes an
 * interrupted paid run, and this is the key it decides "already done" by. Using
 * the same shape as the product means the resume logic is testing the real key,
 * not a stand-in.
 */
export function attemptIdempotencyKey(parts: {
  runId: string;
  operation: string;
  shotId: string;
  attemptNumber: number;
}): string {
  return [parts.runId, parts.operation, parts.shotId, parts.attemptNumber].join(":");
}

const redactedMarker = "[redacted]";

/** Key names that hold a credential no matter what the value looks like. */
const secretKeyPattern = /(?:^|_|-)(?:api[_-]?key|key|token|secret|password|authorization|auth)$/i;

/**
 * Strips credentials out of a provider-shaped request before it is written down.
 *
 * The run log is the deliverable — it gets read, copied into a report and possibly
 * shared — so the API token must not be in it. Two rules, because either alone
 * leaks: values matching a known secret are replaced wherever they appear
 * (including inside `Bearer …`), and credential-shaped keys are masked even when
 * the value is one nobody told us about.
 *
 * Prompts and generation parameters are deliberately untouched: they are the
 * input §5.2 asks us to save, and they are what explains the cost.
 */
export function redactSecrets(value: unknown, secrets: readonly string[]): unknown {
  const present = secrets.filter((secret) => secret.length > 0);

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      return present.some((secret) => node.includes(secret)) ? redactedMarker : node;
    }

    if (Array.isArray(node)) return node.map(walk);

    if (node !== null && typeof node === "object") {
      return Object.fromEntries(
        Object.entries(node).map(([key, child]) => [
          key,
          secretKeyPattern.test(key) ? redactedMarker : walk(child),
        ]),
      );
    }

    return node;
  };

  return walk(value);
}
