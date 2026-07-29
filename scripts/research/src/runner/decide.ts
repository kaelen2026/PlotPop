import type { AttemptRecord } from "../records/attempt.js";
import { nextAttemptNumber, succeededShotIds } from "../records/log.js";

/**
 * Whether to generate a shot, leave it alone, or stop the run.
 *
 * This is where a paid experiment loses money, so it is a pure function of the run
 * log and gets tested on its own. Four rules matter:
 *
 * - The spend cap is checked **before** the request, against the estimate. A cap
 *   you notice on the way out is a receipt, not a cap.
 * - A moderation rejection or invalid input ends the shot even with budget left:
 *   retrying spends the rest of the budget on a request that cannot succeed.
 * - A timeout goes to a human. CLAUDE.md says to ask the provider what really
 *   happened first, and the harness cannot: the provider may already be rendering
 *   the shot, and already billing for it.
 * - The attempt budget is Gate B's, not an arbitrary limit. Four attempts is one
 *   generation plus the three regenerations §4 allows, so a run cannot pass Gate B
 *   by trying harder than the gate permits.
 */

export type SkipReason =
  | "already_usable"
  | "attempt_budget_exhausted"
  | "not_retryable"
  | "needs_manual_reconciliation";

export type ShotDecision =
  | { readonly action: "generate"; readonly attemptNumber: number }
  | { readonly action: "skip"; readonly reason: SkipReason }
  | { readonly action: "stop"; readonly reason: "spend_cap_reached" };

export type DecisionInput = {
  readonly shotId: string;
  /** The whole log, not just this shot's slice. */
  readonly attempts: readonly AttemptRecord[];
  readonly maxAttemptsPerShot: number;
  readonly spentUsd: number;
  /** `null` only for the offline provider, which cannot spend anything. */
  readonly spendCapUsd: number | null;
  readonly estimatedNextCostUsd: number;
};

export function decideShotAction(input: DecisionInput): ShotDecision {
  const mine = input.attempts.filter((attempt) => attempt.shotId === input.shotId);

  // Checked before the cap: a shot that needs no request cannot push the run over
  // a spending limit, and halting on one would strand the shots after it.
  if (succeededShotIds(mine).has(input.shotId)) {
    return { action: "skip", reason: "already_usable" };
  }

  if (mine.length >= input.maxAttemptsPerShot) {
    return { action: "skip", reason: "attempt_budget_exhausted" };
  }

  const latest = [...mine].sort((left, right) => right.attemptNumber - left.attemptNumber)[0];

  if (latest?.failure) {
    if (latest.failure.retryDisposition === "do_not_retry") {
      return { action: "skip", reason: "not_retryable" };
    }
    if (latest.failure.retryDisposition === "reconcile_first") {
      return { action: "skip", reason: "needs_manual_reconciliation" };
    }
  }

  if (
    input.spendCapUsd !== null &&
    input.spentUsd + input.estimatedNextCostUsd > input.spendCapUsd
  ) {
    return { action: "stop", reason: "spend_cap_reached" };
  }

  return { action: "generate", attemptNumber: nextAttemptNumber(mine, input.shotId) };
}
