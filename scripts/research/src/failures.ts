import { z } from "zod";

/**
 * Failure classes for the F-00 experiment, and the retry policy derived from them.
 *
 * Two rules from CLAUDE.md are what this file exists to make unmissable:
 *
 * - Network errors, 429s and provider 5xx retry with exponential backoff plus
 *   jitter.
 * - Invalid input and moderation rejections **never** retry automatically.
 *   Retrying a content-policy rejection burns money on a request that cannot
 *   succeed, and does it as many times as the budget allows.
 *
 * Timeouts get a third answer. A submit that timed out may already be running and
 * already billable, so it is neither safely retryable nor safely abandoned: ask
 * the provider what actually happened first.
 *
 * Provider vocabulary stops here. `providerCode` and `providerMessage` are carried
 * for the run log and for the human reading it, and the adapter is the only thing
 * that reads them (ADR-005): downstream code sees `FailureClass`.
 */

export const failureClassSchema = z.enum([
  "network",
  "timeout",
  "rate_limited",
  "provider_unavailable",
  "authentication",
  "quota_exhausted",
  "invalid_input",
  "moderation_rejected",
  "unknown",
]);

export type FailureClass = z.infer<typeof failureClassSchema>;

export const retryDispositionSchema = z.enum([
  "retry_with_backoff",
  "reconcile_first",
  "do_not_retry",
]);

export type RetryDisposition = z.infer<typeof retryDispositionSchema>;

/**
 * What we saw, before interpretation.
 *
 * `transport` separates "the provider answered" from "we never got an answer",
 * because an HTTP status and a socket error are not the same evidence and a
 * missing status is not a 500.
 */
export const failureObservationSchema = z.strictObject({
  transport: z.enum(["responded", "network_error", "deadline_exceeded"]),
  httpStatus: z.number().int().min(100).max(599).optional(),
  providerCode: z.string().min(1).optional(),
  providerMessage: z.string().optional(),
  /**
   * Set by the adapter when it recognises one of its provider's own codes — a
   * moderation rejection that arrives as a plain 400 is only knowable there.
   */
  providerClassHint: failureClassSchema.optional(),
});

export type FailureObservation = z.infer<typeof failureObservationSchema>;

export type Classification = {
  readonly failureClass: FailureClass;
  readonly retryDisposition: RetryDisposition;
};

const statusClasses: ReadonlyMap<number, FailureClass> = new Map([
  [400, "invalid_input"],
  [401, "authentication"],
  [402, "quota_exhausted"],
  [403, "authentication"],
  [404, "invalid_input"],
  [408, "timeout"],
  [413, "invalid_input"],
  [415, "invalid_input"],
  [422, "invalid_input"],
  [429, "rate_limited"],
]);

function classOfStatus(httpStatus: number): FailureClass {
  const mapped = statusClasses.get(httpStatus);
  if (mapped !== undefined) return mapped;
  if (httpStatus >= 500) return "provider_unavailable";

  // A 4xx we have no rule for is not "probably bad input". Guessing here would
  // either retry something unretryable or abandon something that would have
  // worked; `unknown` sends it to the operator instead.
  return "unknown";
}

const dispositions: Readonly<Record<FailureClass, RetryDisposition>> = {
  network: "retry_with_backoff",
  rate_limited: "retry_with_backoff",
  provider_unavailable: "retry_with_backoff",
  timeout: "reconcile_first",
  authentication: "do_not_retry",
  quota_exhausted: "do_not_retry",
  invalid_input: "do_not_retry",
  moderation_rejected: "do_not_retry",
  unknown: "do_not_retry",
};

/**
 * One table, consulted by everything. The invariant worth protecting is that
 * nobody can decide a moderation rejection is retryable "just here": there is no
 * second place to decide it.
 */
export function retryDispositionOf(failureClass: FailureClass): RetryDisposition {
  return dispositions[failureClass];
}

export function classifyFailure(observation: FailureObservation): Classification {
  const failureClass = classOf(observation);

  return { failureClass, retryDisposition: retryDispositionOf(failureClass) };
}

function classOf(observation: FailureObservation): FailureClass {
  if (observation.providerClassHint !== undefined) return observation.providerClassHint;
  if (observation.transport === "network_error") return "network";
  if (observation.transport === "deadline_exceeded") return "timeout";
  if (observation.httpStatus === undefined) return "unknown";

  return classOfStatus(observation.httpStatus);
}

/**
 * Full jitter: the delay is uniform in `(0, window]` where the window doubles per
 * attempt up to `maxMs`.
 *
 * Jittering *within* the whole window rather than nudging around its edge is the
 * point. Thirty shots that all hit the same 429 would otherwise retry in lockstep
 * forever, each round arriving as one burst and earning the next 429.
 */
export function backoffDelayMs(
  attempt: number,
  options: { readonly baseMs: number; readonly maxMs: number; readonly random: () => number },
): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error(`backoff attempt must be an integer >= 1, got ${attempt}`);
  }

  const window = Math.min(options.baseMs * 2 ** (attempt - 1), options.maxMs);

  return Math.max(1, Math.round(window * options.random()));
}
