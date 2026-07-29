import { describe, expect, it } from "vitest";
import {
  type CreditEstimate,
  coversEstimate,
  creditEstimateSchema,
  isEstimateRange,
  requiresReconfirmation,
} from "./credit-estimate.js";

/**
 * The estimate a paid generation is confirmed against
 * (`docs/ai-comic-drama-saas-design.md` §10, `docs/design-system.md` §12.5).
 *
 * The balance is a field the server sends, never something assembled here: §10
 * says the client must not compute an authoritative balance, so this contract has
 * no ledger entries in it at all. Comparing a given balance to a given estimate is
 * display logic; deriving the balance would not be.
 */

function estimate(overrides: Partial<CreditEstimate> = {}): CreditEstimate {
  return { minCredits: 120, maxCredits: 120, balanceCredits: 500, ...overrides };
}

describe("credit estimate", () => {
  it("accepts a single amount and a range", () => {
    expect(creditEstimateSchema.safeParse(estimate()).success).toBe(true);
    expect(creditEstimateSchema.safeParse(estimate({ maxCredits: 180 })).success).toBe(true);
  });

  it("refuses an upper bound below the lower bound", () => {
    // An inverted range would render as "180 to 120" and make the sufficiency
    // check meaningless.
    expect(
      creditEstimateSchema.safeParse(estimate({ minCredits: 180, maxCredits: 120 })).success,
    ).toBe(false);
  });

  it("refuses fractional or negative credits", () => {
    expect(creditEstimateSchema.safeParse(estimate({ minCredits: -1 })).success).toBe(false);
    expect(creditEstimateSchema.safeParse(estimate({ maxCredits: 120.5 })).success).toBe(false);
    expect(creditEstimateSchema.safeParse(estimate({ balanceCredits: -1 })).success).toBe(false);
  });

  it("rejects unknown fields", () => {
    // The estimate is a response body. A stray field means the client and the
    // server disagree about what was quoted.
    expect(
      creditEstimateSchema.safeParse({ ...estimate(), providerName: "somebody" }).success,
    ).toBe(false);
  });

  it("only calls it a range when the bounds differ", () => {
    expect(isEstimateRange(estimate())).toBe(false);
    expect(isEstimateRange(estimate({ maxCredits: 180 }))).toBe(true);
  });

  it("measures the balance against the upper bound, not the lower one", () => {
    // The rule worth pinning: a range whose top exceeds the balance is not
    // affordable, however comfortably its bottom fits. Checking the lower bound
    // would let a generation start that cannot finish.
    expect(
      coversEstimate(estimate({ minCredits: 100, maxCredits: 400, balanceCredits: 400 })),
    ).toBe(true);
    expect(
      coversEstimate(estimate({ minCredits: 100, maxCredits: 401, balanceCredits: 400 })),
    ).toBe(false);
  });

  it("asks for confirmation again only when the quote changed", () => {
    // ADR-005: a confirmed price ceiling must not be exceeded without asking
    // again, so the server states that the quote moved and the reason why.
    expect(requiresReconfirmation(estimate())).toBe(false);
    expect(requiresReconfirmation(estimate({ changeReason: "estimate_increased" }))).toBe(true);
  });

  it("keeps the change reason free of provider identity", () => {
    // Invariant 4: a provider name must not reach the user. TypeScript already
    // stops a call site writing one, so this parses an untyped object — the shape
    // a response body actually arrives in.
    expect(
      creditEstimateSchema.safeParse({ ...estimate(), changeReason: "provider_b" }).success,
    ).toBe(false);
    expect(creditEstimateSchema.shape.changeReason.unwrap().options).toEqual([
      "quality_tier_changed",
      "shot_count_changed",
      "estimate_increased",
    ]);
  });
});
