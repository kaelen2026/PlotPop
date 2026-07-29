import { describe, expect, it } from "vitest";
import { GENERATION_STATUSES, generationStatusSchema } from "./generation-status.js";

/**
 * The unified task status from `docs/ai-comic-drama-saas-design.md` §11 and
 * `docs/design-system.md` §12.4.
 *
 * This lives in the contracts package rather than in the UI because all three
 * services touch it: the API writes it, the Worker advances it, and the Web only
 * renders it. A page that invents a seventh state, or spells one differently, is
 * the failure this schema exists to prevent.
 */

describe("generation status", () => {
  it("carries exactly the six documented states, in lifecycle order", () => {
    expect(GENERATION_STATUSES).toEqual([
      "draft",
      "queued",
      "generating",
      "needs_review",
      "completed",
      "failed",
    ]);
    expect(generationStatusSchema.options).toEqual(GENERATION_STATUSES);
  });

  it("rejects a state that is not in the contract", () => {
    // `in_progress` and `error` are the names a page reaches for when it stops
    // reading this file.
    for (const invented of ["in_progress", "error", "pending", ""]) {
      expect(generationStatusSchema.safeParse(invented).success).toBe(false);
    }
  });

  it("rejects a differently spelled state", () => {
    // The wire and database value is snake_case; a camelCase variant would pass
    // silently through a hand written string type.
    expect(generationStatusSchema.safeParse("needsReview").success).toBe(false);
    expect(generationStatusSchema.safeParse("Draft").success).toBe(false);
  });
});
