import { z } from "zod";

/**
 * The estimate a paid generation is confirmed against
 * (`docs/ai-comic-drama-saas-design.md` §10, `docs/design-system.md` §12.5).
 *
 * `balanceCredits` is a value the server sends. §10 forbids the client computing
 * an authoritative balance, which is why no ledger entry appears in this contract:
 * comparing a quoted estimate to a quoted balance is display logic, deriving the
 * balance would not be.
 *
 * The reasons are product level on purpose. Invariant 4 keeps provider identity
 * out of anything a user can see, and an enum is what stops a call site inventing
 * "fell back to the other vendor".
 */
export const creditEstimateChangeReasonSchema = z.enum([
  "quality_tier_changed",
  "shot_count_changed",
  "estimate_increased",
]);

export type CreditEstimateChangeReason = z.infer<typeof creditEstimateChangeReasonSchema>;

export const creditEstimateSchema = z
  .strictObject({
    minCredits: z.int().min(0),
    maxCredits: z.int().min(0),
    balanceCredits: z.int().min(0),
    /**
     * Set when this quote replaces one the user already confirmed. ADR-005 does
     * not allow a confirmed ceiling to be exceeded without asking again.
     */
    changeReason: creditEstimateChangeReasonSchema.optional(),
  })
  .refine((estimate) => estimate.maxCredits >= estimate.minCredits, {
    message: "maxCredits must not be below minCredits",
    path: ["maxCredits"],
  });

export type CreditEstimate = z.infer<typeof creditEstimateSchema>;

export function isEstimateRange(estimate: CreditEstimate): boolean {
  return estimate.maxCredits > estimate.minCredits;
}

/**
 * Whether the balance covers the whole estimate.
 *
 * Measured against the upper bound: a range whose top exceeds the balance is not
 * affordable however comfortably its bottom fits, and starting a generation that
 * cannot finish is the failure this prevents.
 */
export function coversEstimate(estimate: CreditEstimate): boolean {
  return estimate.balanceCredits >= estimate.maxCredits;
}

export function requiresReconfirmation(estimate: CreditEstimate): boolean {
  return estimate.changeReason !== undefined;
}
