import type { FailureObservation } from "../failures.js";
import type { TestShot } from "../testset/schema.js";
import type { TierRequest } from "../tiers.js";

/**
 * The one-off experiment adapter interface.
 *
 * It is deliberately a narrow subset of the eight-method adapter ADR-005 defines
 * for `packages/providers`: submit, poll, download. F-00 has no callbacks to
 * verify, no cancellation UI and no router, and building those here would produce a
 * second implementation to keep in step with the real one. What this interface does
 * borrow is the important part — the provider's own vocabulary stops at the
 * boundary. Everything past `submit` and `poll` speaks in `FailureObservation`,
 * seconds and bytes.
 *
 * Adding a second provider means one more file next to `replicate.ts` implementing
 * this type. Nothing else in the harness changes.
 */

export type ProviderRequest = {
  readonly shot: TestShot;
  readonly tier: TierRequest;
  readonly prompt: string;
  readonly referenceImagePaths: readonly string[];
};

export type SubmitOutcome =
  | {
      readonly state: "submitted";
      readonly taskId: string | null;
      /** The request as sent, already stripped of credentials, for the run log. */
      readonly parameters: Record<string, unknown>;
    }
  | {
      readonly state: "failed";
      readonly observation: FailureObservation;
      readonly parameters: Record<string, unknown>;
    };

export type PollOutcome =
  | { readonly state: "pending" }
  | {
      readonly state: "succeeded";
      readonly resultUrl: string | null;
      /** Set instead of `resultUrl` by providers that hand bytes back directly. */
      readonly bytes: Uint8Array | null;
      /** Compute time the provider itself reported, if it reported any. */
      readonly providerComputeSeconds: number | null;
    }
  | { readonly state: "failed"; readonly observation: FailureObservation };

export type ExperimentProvider = {
  readonly id: string;
  readonly model: string;
  submit(request: ProviderRequest, signal: AbortSignal): Promise<SubmitOutcome>;
  poll(taskId: string | null, signal: AbortSignal): Promise<PollOutcome>;
  download(resultUrl: string, signal: AbortSignal): Promise<Uint8Array>;
};
