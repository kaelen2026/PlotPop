import type { CreditEstimate } from "@plotpop/contracts";

/**
 * Placeholder estimate for the F-02 prototype.
 *
 * A real quote is produced server side once F-06 exists; the Web never computes
 * one (§10). A range rather than a single figure, because that is the honest shape
 * of a shot by shot estimate and §12.5 requires the range to be shown as one.
 *
 * Delete this module when the wizard reads the API.
 */
export const prototypeCreditEstimate: CreditEstimate = {
  minCredits: 320,
  maxCredits: 480,
  balanceCredits: 1200,
};
