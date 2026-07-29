import { describe, expect, it } from "vitest";
import { classifyFailure } from "../failures.js";
import { classifyReplicateFailure, outputUrlOf } from "./replicate.js";

describe("mapping a provider answer onto a failure class", () => {
  it("leaves an ordinary rate limit to the http rules", () => {
    expect(classifyFailure(classifyReplicateFailure(429, "too many requests")).failureClass).toBe(
      "rate_limited",
    );
  });

  it("reads a content-policy refusal as moderation, not as bad input", () => {
    // The expensive distinction: bad input and a refusal both arrive as 422, and
    // only one of them is worth another attempt.
    for (const message of [
      "NSFW content detected",
      "Your request was flagged by our safety system",
      "This prompt is not allowed",
      "output failed the content policy check",
    ]) {
      expect(classifyFailure(classifyReplicateFailure(422, message)).failureClass).toBe(
        "moderation_rejected",
      );
    }
  });

  it("never retries a refusal, whatever status carried it", () => {
    expect(
      classifyFailure(classifyReplicateFailure(500, "content policy violation")).retryDisposition,
    ).toBe("do_not_retry");
  });

  it("keeps a genuine bad request retryable-by-nobody but distinguishable", () => {
    expect(
      classifyFailure(classifyReplicateFailure(422, "input.duration must be a number"))
        .failureClass,
    ).toBe("invalid_input");
  });

  it("reads a failed prediction with no status code as unclassified rather than guessing", () => {
    expect(classifyFailure(classifyReplicateFailure(undefined, "boom")).failureClass).toBe(
      "unknown",
    );
  });

  it("carries the provider's own message through for the run log", () => {
    expect(classifyReplicateFailure(500, "upstream exploded").providerMessage).toBe(
      "upstream exploded",
    );
  });
});

describe("finding the finished render", () => {
  it("takes a single url", () => {
    expect(outputUrlOf("https://example.test/a.mp4")).toBe("https://example.test/a.mp4");
  });

  it("takes the last url when a model streams intermediates", () => {
    expect(outputUrlOf(["https://example.test/a.mp4", "https://example.test/b.mp4"])).toBe(
      "https://example.test/b.mp4",
    );
  });

  it("reports nothing rather than a partial answer for an output it does not recognise", () => {
    expect(outputUrlOf({ video: "https://example.test/a.mp4" })).toBeNull();
    expect(outputUrlOf(null)).toBeNull();
    expect(outputUrlOf([])).toBeNull();
  });
});
