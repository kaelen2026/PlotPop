import { z } from "zod";
import type { MediaFacts } from "./media/ffprobe.js";

/**
 * The three product tiers, expressed as what F-00 *asks* the provider for.
 *
 * These are the experiment's independent variables, not results. §24 fixes the
 * shape — Draft is a cheap preview, Standard is the balance, Pro is the best route
 * currently available — and users only ever see these three names, never a
 * provider (ADR-005). What each tier actually costs, how long it takes and how
 * often it passes first time are measurements, and they live as blanks in
 * `docs/research/unit-economics.md` until a real run fills them in. Nothing in
 * this file may be read as a measured figure.
 *
 * `describeTierDrift` exists because a provider that quietly ignores a parameter
 * is the failure mode that survives review: the clip plays, the human scores it,
 * and only the tier promise is broken.
 */

export const qualityTierSchema = z.enum(["draft", "standard", "pro"]);

export type QualityTier = z.infer<typeof qualityTierSchema>;

export const tierRequestSchema = z.strictObject({
  tier: qualityTierSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frameRate: z.number().positive(),
  maxShotSeconds: z.number().positive(),
  purpose: z.string().min(1),
});

export type TierRequest = z.infer<typeof tierRequestSchema>;

export const tierRequests: Readonly<Record<QualityTier, TierRequest>> = {
  draft: tierRequestSchema.parse({
    tier: "draft",
    width: 854,
    height: 480,
    frameRate: 24,
    maxShotSeconds: 5,
    purpose: "Reviewable preview before any expensive generation (§33)",
  }),
  standard: tierRequestSchema.parse({
    tier: "standard",
    width: 1280,
    height: 720,
    frameRate: 24,
    maxShotSeconds: 8,
    purpose: "The balance of quality, speed and cost most episodes ship at (§24)",
  }),
  pro: tierRequestSchema.parse({
    tier: "pro",
    width: 1920,
    height: 1080,
    frameRate: 30,
    maxShotSeconds: 8,
    purpose: "Highest quality route currently available (§24)",
  }),
};

export const tierDriftSchema = z.strictObject({
  field: z.enum(["resolution", "frameRate", "duration"]),
  requested: z.string(),
  delivered: z.string(),
});

export type TierDrift = z.infer<typeof tierDriftSchema>;

/**
 * Rounding room, not slack.
 *
 * A 23.976 delivered against a 24 request is the same footage; 16 against 24 is a
 * different product. Half a second on a five second clip is what encoders and
 * keyframe alignment do; a whole second missing is a shot that no longer matches
 * the shot list.
 */
const frameRateTolerance = 0.5;
const durationToleranceSeconds = 0.5;

/**
 * Compares what came back against what the tier asked for.
 *
 * Larger than requested is not drift: a provider that hands back 1080p for a 720p
 * request has given the user more than they paid for, and flagging it would train
 * whoever reads the report to ignore the column.
 */
export function describeTierDrift(
  facts: MediaFacts,
  request: TierRequest,
  requestedSeconds: number,
): TierDrift[] {
  const drift: TierDrift[] = [];

  if (facts.width < request.width || facts.height < request.height) {
    drift.push({
      field: "resolution",
      requested: `${request.width}x${request.height}`,
      delivered: `${facts.width}x${facts.height}`,
    });
  }

  if (facts.frameRate < request.frameRate - frameRateTolerance) {
    drift.push({
      field: "frameRate",
      requested: `${request.frameRate}`,
      delivered: `${facts.frameRate}`,
    });
  }

  if (Math.abs(facts.durationSeconds - requestedSeconds) > durationToleranceSeconds) {
    drift.push({
      field: "duration",
      requested: `${requestedSeconds}s`,
      delivered: `${facts.durationSeconds}s`,
    });
  }

  return drift;
}
