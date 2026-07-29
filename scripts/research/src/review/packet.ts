import { createHash } from "node:crypto";
import { z } from "zod";
import type { AttemptRecord } from "../records/attempt.js";

/**
 * Turns a run's outputs into a blind review packet.
 *
 * `docs/research/consistency-gate.md` §5 requires raters not to be told the
 * quality tier, the provider, or which regeneration a clip is. So the sample code
 * carries none of it: codes are `sample-01`… assigned in a shuffled order, and the
 * only thing that maps a code back to a shot is a mapping file that stays with the
 * team.
 *
 * Every attempt that produced a file becomes its own sample, first tries and redos
 * alike. That is what makes Gate A measurable without biasing it — a rater who
 * knew "this is the third go" would score it differently, and Gate A is precisely
 * the rate at which first tries pass.
 *
 * Gate D is separate and deliberately *not* blinded to order: §4 asks whether the
 * finished sequence works as a stretch of an episode, which cannot be asked of a
 * shuffled pile.
 */

export const reviewSampleSchema = z.strictObject({
  code: z.string().regex(/^sample-\d{2,}$/),
  sourcePath: z.string().min(1),
});

export type ReviewSample = z.infer<typeof reviewSampleSchema>;

export const reviewMappingSchema = z.strictObject({
  code: z.string().min(1),
  shotId: z.string().min(1),
  attemptNumber: z.number().int().min(1),
  tier: z.string().min(1),
  providerId: z.string().min(1),
  sourcePath: z.string().min(1),
});

export type ReviewMapping = z.infer<typeof reviewMappingSchema>;

export type ReviewPacket = {
  /** Shuffled, coded, one per attempt that produced a file. */
  readonly samples: readonly ReviewSample[];
  /** The un-blinding key. Never handed to a rater. */
  readonly mapping: readonly ReviewMapping[];
  /** Accepted takes in story order, for the Gate D viewing. */
  readonly sequence: readonly { readonly shotId: string; readonly sourcePath: string }[];
};

/**
 * A tiny seeded generator, so a packet is reproducible.
 *
 * Reproducibility matters more than randomness quality here: if a rater loses a
 * scorecard, the same seed rebuilds the same packet, and the codes they already
 * filled in still mean the same clips.
 */
function seededRandom(seed: string): () => number {
  let state = createHash("sha256").update(seed).digest().readUInt32LE(0) || 1;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const left = copy[index];
    const right = copy[swap];

    if (left !== undefined && right !== undefined) {
      copy[index] = right;
      copy[swap] = left;
    }
  }

  return copy;
}

export function buildReviewPacket(
  records: readonly AttemptRecord[],
  options: { readonly seed: string; readonly shotOrder: readonly string[] },
): ReviewPacket {
  const delivered = records.filter(
    (record): record is AttemptRecord & { output: NonNullable<AttemptRecord["output"]> } =>
      record.outcome === "succeeded" && record.output !== null,
  );

  const order = shuffled(delivered, seededRandom(options.seed));
  const width = Math.max(2, String(order.length).length);

  const mapping = order.map((record, index) => ({
    code: `sample-${String(index + 1).padStart(width, "0")}`,
    shotId: record.shotId,
    attemptNumber: record.attemptNumber,
    tier: record.tier,
    providerId: record.provider.id,
    sourcePath: record.output.path,
  }));

  // The earliest delivered take is the one the sequence keeps, matching what the
  // cost rollup counts as accepted footage.
  const accepted = new Map<string, AttemptRecord & { output: { path: string } }>();
  for (const record of [...delivered].sort(
    (left, right) => left.attemptNumber - right.attemptNumber,
  )) {
    if (!accepted.has(record.shotId)) accepted.set(record.shotId, record);
  }

  return {
    samples: mapping.map((entry) => ({ code: entry.code, sourcePath: entry.sourcePath })),
    mapping,
    sequence: options.shotOrder.flatMap((shotId) => {
      const record = accepted.get(shotId);

      return record ? [{ shotId, sourcePath: record.output.path }] : [];
    }),
  };
}
