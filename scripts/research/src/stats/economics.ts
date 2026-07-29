import type { FailureClass } from "../failures.js";
import type { AttemptRecord } from "../records/attempt.js";
import { type Summary, summarize } from "./percentiles.js";

/**
 * Turns a run log into the figures §34.1 asks for, and into the inputs the four
 * gates are judged on.
 *
 * Three decisions here are the ones that keep the numbers from flattering us:
 *
 * - The first-pass rate divides by the **whole test set**, not by the shots that
 *   happened to be attempted. A run that stopped after two good shots otherwise
 *   reports 100%, which is exactly the reading that would let a failed Gate A
 *   through.
 * - Failed attempts are billed into the total, because providers bill them. A
 *   render that succeeded and then failed moderation still costs money.
 * - Cost per finished minute divides by **accepted** footage, not by everything
 *   rendered. The user pays for the minute they keep; the discarded takes are our
 *   cost, not their runtime.
 */

export type RunReport = {
  readonly plannedShotCount: number;
  readonly attemptedShotCount: number;
  readonly attemptCount: number;
  readonly firstPassShotCount: number;
  readonly firstPassRate: number;
  /** Shots with no usable version. Gate B requires this to be empty. */
  readonly unresolvedShotIds: readonly string[];
  readonly attemptsPerResolvedShot: Summary | null;
  /** Per attempt: queue plus render, the figure §34.1 wants P50/P95 of. */
  readonly generateLatencyMs: Summary | null;
  /** Per shot: everything it took to reach a usable version. */
  readonly shotWallClockMs: Summary | null;
  readonly costUsd: {
    readonly total: number;
    readonly onFailedAttempts: number;
    readonly perResolvedShot: Summary | null;
    readonly perAcceptedMinute: number | null;
  };
  readonly acceptedOutputSeconds: number;
  readonly usageCoverage: {
    readonly attemptsWithUsage: number;
    readonly attemptsWithProviderReportedUsage: number;
  };
  readonly failureCounts: Readonly<Partial<Record<FailureClass, number>>>;
};

const secondsPerMinute = 60;

export function summarizeRun(
  records: readonly AttemptRecord[],
  plannedShotIds: readonly string[],
): RunReport {
  const planned = new Set(plannedShotIds);

  for (const record of records) {
    if (!planned.has(record.shotId)) {
      // A record for a shot outside the frozen set means the set changed mid-run,
      // and every ratio below would be computed over a moving denominator.
      throw new Error(
        `attempt log holds ${record.shotId}, which is not part of the frozen test set`,
      );
    }
  }

  const byShot = new Map<string, AttemptRecord[]>();
  for (const record of records) {
    const existing = byShot.get(record.shotId);
    if (existing) existing.push(record);
    else byShot.set(record.shotId, [record]);
  }

  const resolvedShots = [...byShot.entries()].filter(([, attempts]) =>
    attempts.some((attempt) => attempt.outcome === "succeeded"),
  );

  const firstPassShotCount = [...byShot.values()].filter((attempts) =>
    attempts.some((attempt) => attempt.attemptNumber === 1 && attempt.outcome === "succeeded"),
  ).length;

  const costOf = (attempt: AttemptRecord) => attempt.usage?.costUsd ?? 0;
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

  const total = sum(records.map(costOf));
  const onFailedAttempts = sum(
    records.filter((record) => record.outcome !== "succeeded").map(costOf),
  );

  // The earliest success is the take the run keeps: a later success is another
  // candidate version, not more runtime.
  const acceptedOutputSeconds = sum(
    resolvedShots.map(([, attempts]) => {
      const accepted = [...attempts]
        .filter((attempt) => attempt.outcome === "succeeded")
        .sort((left, right) => left.attemptNumber - right.attemptNumber)[0];

      return accepted?.output?.media.durationSeconds ?? 0;
    }),
  );

  const failureCounts: Partial<Record<FailureClass, number>> = {};
  for (const record of records) {
    if (record.failure === null) continue;
    const seen = failureCounts[record.failure.failureClass] ?? 0;
    failureCounts[record.failure.failureClass] = seen + 1;
  }

  return {
    plannedShotCount: planned.size,
    attemptedShotCount: byShot.size,
    attemptCount: records.length,
    firstPassShotCount,
    firstPassRate: planned.size === 0 ? 0 : firstPassShotCount / planned.size,
    unresolvedShotIds: plannedShotIds.filter(
      (shotId) => !resolvedShots.some(([resolved]) => resolved === shotId),
    ),
    attemptsPerResolvedShot: summarize(resolvedShots.map(([, attempts]) => attempts.length)),
    generateLatencyMs: summarize(records.map((record) => record.latencyMs.generate)),
    shotWallClockMs: summarize(
      resolvedShots.map(([, attempts]) => sum(attempts.map((attempt) => attempt.latencyMs.total))),
    ),
    costUsd: {
      total,
      onFailedAttempts,
      perResolvedShot: summarize(resolvedShots.map(([, attempts]) => sum(attempts.map(costOf)))),
      perAcceptedMinute:
        acceptedOutputSeconds === 0 ? null : total / (acceptedOutputSeconds / secondsPerMinute),
    },
    acceptedOutputSeconds,
    usageCoverage: {
      attemptsWithUsage: records.filter((record) => record.usage !== null).length,
      attemptsWithProviderReportedUsage: records.filter(
        (record) => record.usage?.reportedByProvider === true,
      ).length,
    },
    failureCounts,
  };
}

/**
 * The economic re-check `consistency-gate.md` §6 requires once real costs exist:
 *
 * ```text
 * cost per shot x (1 / first-pass rate) x shots per episode
 * ```
 *
 * `1/p` is the direct COGS multiplier, which is why §6 forbids answering a failed
 * re-check by lowering Gate A: a lower bar does not make the shot cheaper, it moves
 * the cost onto the user as manual rework.
 */
export function projectEpisodeCostUsd(inputs: {
  costPerShotUsd: number;
  firstPassRate: number;
  shotsPerEpisode: number;
}): number {
  if (!(inputs.firstPassRate > 0 && inputs.firstPassRate <= 1)) {
    throw new Error(`first-pass rate must be in (0, 1], got ${inputs.firstPassRate}`);
  }

  return inputs.costPerShotUsd * (1 / inputs.firstPassRate) * inputs.shotsPerEpisode;
}
