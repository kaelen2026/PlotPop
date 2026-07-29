import { describe, expect, it } from "vitest";
import {
  backoffDelayMs,
  classifyFailure,
  failureClassSchema,
  failureObservationSchema,
  retryDispositionOf,
} from "./failures.js";

function observe(observation: unknown) {
  return classifyFailure(failureObservationSchema.parse(observation));
}

describe("failure classification", () => {
  it("reads a refused connection as a network failure", () => {
    expect(observe({ transport: "network_error", providerMessage: "ECONNRESET" })).toEqual({
      failureClass: "network",
      retryDisposition: "retry_with_backoff",
    });
  });

  it("reads our own deadline as a timeout", () => {
    expect(observe({ transport: "deadline_exceeded" }).failureClass).toBe("timeout");
  });

  it.each([
    [429, "rate_limited"],
    [500, "provider_unavailable"],
    [502, "provider_unavailable"],
    [503, "provider_unavailable"],
    [401, "authentication"],
    [403, "authentication"],
    [402, "quota_exhausted"],
    [400, "invalid_input"],
    [404, "invalid_input"],
    [422, "invalid_input"],
    [408, "timeout"],
    [409, "unknown"],
  ])("reads HTTP %i as %s", (httpStatus, expected) => {
    expect(observe({ transport: "responded", httpStatus }).failureClass).toBe(expected);
  });

  it("treats an answer with no status as unclassified rather than guessing", () => {
    expect(observe({ transport: "responded" }).failureClass).toBe("unknown");
  });

  it("prefers the adapter's own reading, because only it knows its provider's codes", () => {
    const classification = observe({
      transport: "responded",
      httpStatus: 400,
      providerCode: "content_policy_violation",
      providerClassHint: "moderation_rejected",
    });

    expect(classification.failureClass).toBe("moderation_rejected");
  });
});

describe("retry disposition", () => {
  it.each(["network", "rate_limited", "provider_unavailable"] as const)(
    "retries %s with backoff",
    (failureClass) => {
      expect(retryDispositionOf(failureClass)).toBe("retry_with_backoff");
    },
  );

  it.each(["invalid_input", "moderation_rejected", "authentication", "quota_exhausted"] as const)(
    "never automatically retries %s",
    (failureClass) => {
      expect(retryDispositionOf(failureClass)).toBe("do_not_retry");
    },
  );

  it("asks for the provider's real state before resubmitting a timeout", () => {
    // A timed-out submit may already be running and billable; resubmitting blind
    // pays twice.
    expect(retryDispositionOf("timeout")).toBe("reconcile_first");
  });

  it("does not automatically retry what it could not classify", () => {
    expect(retryDispositionOf("unknown")).toBe("do_not_retry");
  });

  it("assigns a disposition to every failure class", () => {
    for (const failureClass of failureClassSchema.options) {
      expect(retryDispositionOf(failureClass)).toBeTruthy();
    }
  });
});

describe("backoff", () => {
  const options = { baseMs: 1000, maxMs: 30_000, random: () => 1 };

  it("doubles per attempt", () => {
    expect(backoffDelayMs(1, options)).toBe(1000);
    expect(backoffDelayMs(2, options)).toBe(2000);
    expect(backoffDelayMs(3, options)).toBe(4000);
  });

  it("stops growing at the ceiling", () => {
    expect(backoffDelayMs(10, options)).toBe(30_000);
  });

  it("spreads the delay over the full window, so retries do not resynchronise", () => {
    // Full jitter: the delay is uniform in (0, window], not window ± a nudge.
    expect(backoffDelayMs(3, { ...options, random: () => 0.25 })).toBe(1000);
    expect(backoffDelayMs(3, { ...options, random: () => 0 })).toBe(1);
  });

  it("rejects an attempt number below one", () => {
    expect(() => backoffDelayMs(0, options)).toThrow(/attempt/);
  });
});
